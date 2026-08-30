import { resolveWorkspacePath } from './workspace-path';
import { ToolExecutionError } from './tool.interface';

const workspace = '/var/lib/agent-workspaces/run-1';

describe('resolveWorkspacePath', () => {
  it('resolves paths inside the workspace', () => {
    expect(resolveWorkspacePath(workspace, 'src/index.ts')).toBe(
      `${workspace}/src/index.ts`,
    );
    expect(resolveWorkspacePath(workspace, '.')).toBe(workspace);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveWorkspacePath(workspace, '/etc/passwd')).toThrow(
      ToolExecutionError,
    );
  });

  it('rejects traversal out of the workspace', () => {
    expect(() => resolveWorkspacePath(workspace, '../other-run/file')).toThrow(
      ToolExecutionError,
    );
    expect(() =>
      resolveWorkspacePath(workspace, 'a/../../../etc/passwd'),
    ).toThrow(ToolExecutionError);
  });

  it('rejects sibling directories with a shared prefix', () => {
    expect(() => resolveWorkspacePath(workspace, '../run-11/file')).toThrow(
      ToolExecutionError,
    );
  });
});
