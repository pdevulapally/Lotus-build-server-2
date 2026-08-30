import { execFile } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.validation';
import { AgentTool, ToolContext, ToolExecutionError } from './tool.interface';

const MAX_OUTPUT_BYTES = 64 * 1024;

@Injectable()
export class BashTool implements AgentTool {
  private readonly timeoutMs: number;

  readonly definition = {
    name: 'bash',
    description:
      'Run a bash command inside the workspace directory. Output is truncated to 64KB. Commands time out.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The bash command to run' },
      },
      required: ['command'],
    },
  };

  constructor(configService: ConfigService<Env, true>) {
    this.timeoutMs =
      configService.get('AGENT_TOOL_TIMEOUT_SECONDS', { infer: true }) * 1000;
  }

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<string> {
    const command = input['command'];
    if (typeof command !== 'string' || command.length === 0) {
      throw new ToolExecutionError('Missing required string argument: command');
    }
    return new Promise((resolvePromise) => {
      execFile(
        '/bin/bash',
        ['-c', command],
        {
          cwd: context.workspaceDir,
          timeout: this.timeoutMs,
          maxBuffer: MAX_OUTPUT_BYTES,
          env: {
            PATH: process.env['PATH'] ?? '/usr/bin:/bin',
            HOME: context.workspaceDir,
          },
        },
        (error, stdout, stderr) => {
          const output = [stdout, stderr].filter(Boolean).join('\n');
          if (error) {
            const reason = error.killed
              ? `Command timed out after ${this.timeoutMs}ms`
              : `Command exited with an error`;
            resolvePromise(`${reason}\n${output}`.trim());
            return;
          }
          resolvePromise(output.length > 0 ? output : '(no output)');
        },
      );
    });
  }
}
