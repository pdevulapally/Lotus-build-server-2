import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AgentRunStatus, AgentStepType } from '@prisma/client';
import { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from './agent-events.service';
import { ToolRegistryService } from './tools/tool-registry.service';

const SYSTEM_PROMPT = [
  'You are an autonomous software engineering agent operating inside a sandboxed workspace.',
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
  private readonly workspaceRoot: string;
  private readonly cancellations = new Set<string>();

  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly events: AgentEventsService,
    private readonly tools: ToolRegistryService,
  ) {
    this.client = new Anthropic({
      apiKey: configService.get('ANTHROPIC_API_KEY', { infer: true }),
    });
    this.model = configService.get('ANTHROPIC_MODEL', { infer: true });
    this.maxIterations = configService.get('AGENT_MAX_ITERATIONS', {
      infer: true,
    });
    this.workspaceRoot = configService.get('AGENT_WORKSPACE_ROOT', {
      infer: true,
    });
  }

  requestCancellation(runId: string): void {
    this.cancellations.add(runId);
  }

  /** Executes the run to completion. Intended to be called without awaiting. */
  async execute(runId: string, prompt: string): Promise<void> {
    try {
      await this.runLoop(runId, prompt);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown agent error';
      this.logger.error({ runId, err: error }, 'Agent run failed');
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: AgentRunStatus.FAILED,
          error: message,
          finishedAt: new Date(),
        },
      });
      this.events.emit({
        type: 'run_failed',
        runId,
        data: { error: message },
      });
    } finally {
      this.events.complete(runId);
      this.cancellations.delete(runId);
    }
  }

  private async runLoop(runId: string, prompt: string): Promise<void> {
    const workspaceDir = join(this.workspaceRoot, runId);
    await mkdir(workspaceDir, { recursive: true });
    this.events.emit({ type: 'run_started', runId, data: { prompt } });

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: prompt },
    ];
    let stepIndex = 0;

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      if (this.cancellations.has(runId)) {
        await this.prisma.agentRun.update({
          where: { id: runId },
          data: {
            status: AgentRunStatus.CANCELLED,
            finishedAt: new Date(),
          },
        });
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
        await this.prisma.agentRun.update({
          where: { id: runId },
          data: {
            status: AgentRunStatus.COMPLETED,
            finishedAt: new Date(),
          },
        });
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
          workspaceDir,
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

  private async recordStep(
    runId: string,
    index: number,
    step: { type: AgentStepType; content: string; name?: string },
  ): Promise<void> {
    await this.prisma.agentStep.create({
      data: { runId, index, ...step },
    });
  }
}
