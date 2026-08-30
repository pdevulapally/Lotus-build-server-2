import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AgentTool, ToolContext, ToolExecutionError } from './tool.interface';
import { BashTool } from './bash.tool';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './fs.tools';

@Injectable()
export class ToolRegistryService {
  private readonly tools: Map<string, AgentTool>;

  constructor(
    readFileTool: ReadFileTool,
    writeFileTool: WriteFileTool,
    listFilesTool: ListFilesTool,
    bashTool: BashTool,
  ) {
    this.tools = new Map(
      [readFileTool, writeFileTool, listFilesTool, bashTool].map((tool) => [
        tool.definition.name,
        tool,
      ]),
    );
  }

  get definitions(): Anthropic.Tool[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<{ content: string; isError: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: `Unknown tool: ${name}`, isError: true };
    }
    try {
      return { content: await tool.execute(input, context), isError: false };
    } catch (error) {
      if (error instanceof ToolExecutionError) {
        return { content: error.message, isError: true };
      }
      throw error;
    }
  }
}
