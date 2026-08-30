import { isAbsolute, normalize, resolve, sep } from 'node:path';
import { ToolExecutionError } from './tool.interface';

/**
 * Resolves a workspace-relative path, rejecting absolute paths and any
 * traversal that would escape the workspace directory.
 */
export function resolveWorkspacePath(
  workspaceDir: string,
  relativePath: string,
): string {
  if (isAbsolute(relativePath)) {
    throw new ToolExecutionError('Paths must be relative to the workspace');
  }
  const resolved = resolve(workspaceDir, normalize(relativePath));
  if (resolved !== workspaceDir && !resolved.startsWith(workspaceDir + sep)) {
    throw new ToolExecutionError('Path escapes the workspace');
  }
  return resolved;
}
