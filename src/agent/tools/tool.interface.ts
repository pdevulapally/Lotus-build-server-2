import Anthropic from '@anthropic-ai/sdk';
import { SandboxHandle } from '../sandbox/sandbox.service';

export interface ToolContext {
  /** The isolated E2B sandbox owned by the current agent run. */
  sandbox: SandboxHandle;
}

export interface AgentTool {
  readonly definition: Anthropic.Tool;
  execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<string>;
}

export class ToolExecutionError extends Error {}
