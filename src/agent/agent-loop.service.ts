import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AgentRunStatus, AgentStepType } from '@prisma/client';
import { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { FirestoreMirrorService } from '../firebase/firestore-mirror.service';
import { AgentEventsService } from './agent-events.service';
import { SandboxHandle, SandboxService } from './sandbox/sandbox.service';
import { ToolRegistryService } from './tools/tool-registry.service';

const SYSTEM_PROMPT = [
  'You are an autonomous software engineering agent operating inside an isolated cloud sandbox.',
  'Use the available tools to inspect, create, and modify files and to run commands.',
  'Work step by step: gather context before making changes, and verify your work when possible.',
  'When the task is complete, reply with a concise summary of what you did instead of calling more tools.',
].join(' ');

@Injectable()
export class AgentLoopService {
  private readonly logger = new Logger(AgentLoopService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxIterations: number;
  private readonly cancellations = new Set<string>();

  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly events: AgentEventsService,
    private readonly tools: ToolRegistryService,
    private readonly sandboxes: SandboxService,
    private readonly mirror: FirestoreMirrorService,
  ) {
    this.client = new Anthropic({
      apiKey: configService.get('ANTHROPIC_API_KEY', { infer: true }),
    });
    this.model = configService.get('ANTHROPIC_MODEL', { infer: true });
    this.maxIterations = configService.get('AGENT_MAX_ITERATIONS', {
      infer: true,
    });
  }

  requestCancellation(runId: string): void {
    this.cancellations.add(runId);
  }

  /** Executes the run to completion. Intended to be called without awaiting. */
  async execute(runId: string, prompt: string): Promise<void> {
    let sandbox: SandboxHandle | null = null;
    try {
      sandbox = await this.sandboxes.create();
      await this.setRunSandbox(runId, sandbox.sandboxId);
      await this.runLoop(runId, prompt, sandbox);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown agent error';
      this.logger.error({ runId, err: error }, 'Agent run failed');
      await this.finishRun(runId, AgentRunStatus.FAILED, message);
      this.events.emit({
        type: 'run_failed',
        runId,
        data: { error: message },
      });
    } finally {
      if (sandbox) {
        try {
          await sandbox.kill();
        } catch (error) {
          this.logger.error(
            { runId, err: error },
            'Failed to kill sandbox after run',
          );
        }
      }
      this.events.complete(runId);
      this.cancellations.delete(runId);
    }
  }

  private async runLoop(
    runId: string,
    prompt: string,
    sandbox: SandboxHandle,
  ): Promise<void> {
    this.events.emit({ type: 'run_started', runId, data: { prompt } });

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: prompt },
    ];
    let stepIndex = 0;

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      if (this.cancellations.has(runId)) {
        await this.finishRun(runId, AgentRunStatus.CANCELLED, null);
        this.events.emit({ type: 'run_cancelled', runId, data: {} });
        return;
      }

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: this.tools.definitions,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      const toolUses: Anthropic.ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          await this.recordStep(runId, stepIndex++, {
            type: AgentStepType.ASSISTANT,
            content: block.text,
          });
          this.events.emit({
            type: 'assistant_text',
            runId,
            data: { text: block.text },
          });
        } else if (block.type === 'tool_use') {
          toolUses.push(block);
        }
      }

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        await this.finishRun(runId, AgentRunStatus.COMPLETED, null);
        this.events.emit({ type: 'run_completed', runId, data: {} });
        return;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const input = toolUse.input as Record<string, unknown>;
        await this.recordStep(runId, stepIndex++, {
          type: AgentStepType.TOOL_CALL,
          name: toolUse.name,
          content: JSON.stringify(input),
        });
        this.events.emit({
          type: 'tool_call',
          runId,
          data: { name: toolUse.name, input },
        });

        const result = await this.tools.execute(toolUse.name, input, {
          sandbox,
        });
        await this.recordStep(runId, stepIndex++, {
          type: AgentStepType.TOOL_RESULT,
          name: toolUse.name,
          content: result.content,
        });
        this.events.emit({
          type: 'tool_result',
          runId,
          data: {
            name: toolUse.name,
            output: result.content,
            isError: result.isError,
          },
        });
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      messages.push({ role: 'user', content: results });
    }

    throw new Error(
      `Agent exceeded the maximum of ${this.maxIterations} iterations`,
    );
  }

  private async setRunSandbox(runId: string, sandboxId: string): Promise<void> {
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { sandboxId },
    });
    await this.mirror.updateRun(runId, { sandboxId });
  }

  private async finishRun(
    runId: string,
    status: AgentRunStatus,
    error: string | null,
  ): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { status, error, finishedAt },
    });
    await this.mirror.updateRun(runId, { status, error, finishedAt });
  }

  private async recordStep(
    runId: string,
    index: number,
    step: { type: AgentStepType; content: string; name?: string },
  ): Promise<void> {
    const created = await this.prisma.agentStep.create({
      data: { runId, index, ...step },
    });
    await this.mirror.addStep(runId, {
      index,
      type: step.type,
      name: step.name ?? null,
      content: step.content,
      createdAt: created.createdAt,
    });
  }
}
