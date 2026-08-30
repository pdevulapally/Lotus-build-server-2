import Anthropic from '@anthropic-ai/sdk';

export interface ToolContext {
  /** Absolute path of the run's sandboxed workspace directory. */
  workspaceDir: string;
}

export interface AgentTool {
  readonly definition: Anthropic.Tool;
  execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<string>;
}

export class ToolExecutionError extends Error {}
