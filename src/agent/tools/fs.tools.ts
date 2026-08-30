import { Injectable } from '@nestjs/common';
import { SANDBOX_WORKSPACE_ROOT } from '../sandbox/sandbox.service';
import { AgentTool, ToolContext, ToolExecutionError } from './tool.interface';
import { resolveWorkspacePath } from './workspace-path';

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ToolExecutionError(`Missing required string argument: ${key}`);
  }
  return value;
}

@Injectable()
export class ReadFileTool implements AgentTool {
  readonly definition = {
    name: 'read_file',
    description:
      'Read a UTF-8 text file from the sandbox workspace. Path is relative to the workspace root.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Workspace-relative file path' },
      },
      required: ['path'],
    },
  };

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<string> {
    const path = resolveWorkspacePath(
      SANDBOX_WORKSPACE_ROOT,
      requireString(input, 'path'),
    );
    try {
      return await context.sandbox.readFile(path);
    } catch {
      throw new ToolExecutionError(`File not found: ${String(input['path'])}`);
    }
  }
}

@Injectable()
export class WriteFileTool implements AgentTool {
  readonly definition = {
    name: 'write_file',
    description:
      'Create or overwrite a UTF-8 text file in the sandbox workspace, creating parent directories as needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Workspace-relative file path' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
  };

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<string> {
    const relative = requireString(input, 'path');
    const content = input['content'];
    if (typeof content !== 'string') {
      throw new ToolExecutionError('Missing required string argument: content');
    }
    const path = resolveWorkspacePath(SANDBOX_WORKSPACE_ROOT, relative);
    await context.sandbox.writeFile(path, content);
    return `Wrote ${Buffer.byteLength(content)} bytes to ${relative}`;
  }
}

@Injectable()
export class ListFilesTool implements AgentTool {
  readonly definition = {
    name: 'list_files',
    description:
      'List files and directories at a workspace-relative path. Directories are suffixed with "/".',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative directory path; "." for the root',
        },
      },
      required: ['path'],
    },
  };

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<string> {
    const path = resolveWorkspacePath(
      SANDBOX_WORKSPACE_ROOT,
      requireString(input, 'path'),
    );
    let entries;
    try {
      entries = await context.sandbox.listEntries(path);
    } catch {
      throw new ToolExecutionError(
        `Directory not found: ${String(input['path'])}`,
      );
    }
    if (entries.length === 0) {
      return '(empty directory)';
    }
    return entries
      .map((entry) => (entry.isDirectory ? `${entry.name}/` : entry.name))
      .sort()
      .join('\n');
  }
}
