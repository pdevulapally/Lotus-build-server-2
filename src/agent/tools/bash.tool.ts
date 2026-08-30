import { Injectable } from '@nestjs/common';
import { AgentTool, ToolContext, ToolExecutionError } from './tool.interface';

@Injectable()
export class BashTool implements AgentTool {
  readonly definition = {
    name: 'bash',
    description:
      'Run a bash command inside the isolated sandbox workspace. Output is truncated to 64KB. Commands time out.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The bash command to run' },
      },
      required: ['command'],
    },
  };

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<string> {
    const command = input['command'];
    if (typeof command !== 'string' || command.length === 0) {
      throw new ToolExecutionError('Missing required string argument: command');
    }
    const result = await context.sandbox.runCommand(command);
    return result.output;
  }
}
