import { SandboxEntry, SandboxHandle } from '../sandbox/sandbox.service';
import { BashTool } from './bash.tool';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './fs.tools';
import { ToolContext, ToolExecutionError } from './tool.interface';

function fakeSandbox(overrides: Partial<SandboxHandle> = {}): SandboxHandle {
  return {
    sandboxId: 'sbx-test',
    runCommand: jest.fn().mockResolvedValue({ output: 'ok', isError: false }),
    readFile: jest.fn().mockResolvedValue('file-content'),
    writeFile: jest.fn().mockResolvedValue(undefined),
    listEntries: jest.fn().mockResolvedValue([] as SandboxEntry[]),
    kill: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('sandbox tools', () => {
  let sandbox: SandboxHandle;
  let context: ToolContext;

  beforeEach(() => {
    sandbox = fakeSandbox();
    context = { sandbox };
  });

  describe('ReadFileTool', () => {
    const tool = new ReadFileTool();

    it('reads a workspace-relative file through the sandbox', async () => {
      await expect(tool.execute({ path: 'src/app.ts' }, context)).resolves.toBe(
        'file-content',
      );
      expect(sandbox.readFile).toHaveBeenCalledWith('/home/user/src/app.ts');
    });

    it('rejects absolute paths', async () => {
      await expect(
        tool.execute({ path: '/etc/passwd' }, context),
      ).rejects.toThrow(ToolExecutionError);
      expect(sandbox.readFile).not.toHaveBeenCalled();
    });

    it('rejects parent traversal', async () => {
      await expect(
        tool.execute({ path: '../../etc/passwd' }, context),
      ).rejects.toThrow(ToolExecutionError);
    });

    it('converts sandbox read failures into tool errors', async () => {
      sandbox = fakeSandbox({
        readFile: jest.fn().mockRejectedValue(new Error('not found')),
      });
      await expect(
        tool.execute({ path: 'missing.txt' }, { sandbox }),
      ).rejects.toThrow(ToolExecutionError);
    });

    it('rejects a missing path argument', async () => {
      await expect(tool.execute({}, context)).rejects.toThrow(
        ToolExecutionError,
      );
    });
  });

  describe('WriteFileTool', () => {
    const tool = new WriteFileTool();

    it('writes through the sandbox at a confined path', async () => {
      await tool.execute({ path: 'a/b.txt', content: 'hello' }, context);
      expect(sandbox.writeFile).toHaveBeenCalledWith(
        '/home/user/a/b.txt',
        'hello',
      );
    });

    it('rejects a non-string content argument', async () => {
      await expect(
        tool.execute({ path: 'a.txt', content: 42 }, context),
      ).rejects.toThrow(ToolExecutionError);
      expect(sandbox.writeFile).not.toHaveBeenCalled();
    });

    it('rejects escaping paths', async () => {
      await expect(
        tool.execute({ path: '../escape.txt', content: 'x' }, context),
      ).rejects.toThrow(ToolExecutionError);
    });
  });

  describe('ListFilesTool', () => {
    const tool = new ListFilesTool();

    it('lists entries with directory suffixes, sorted', async () => {
      sandbox = fakeSandbox({
        listEntries: jest.fn().mockResolvedValue([
          { name: 'src', isDirectory: true },
          { name: 'README.md', isDirectory: false },
        ]),
      });
      await expect(tool.execute({ path: '.' }, { sandbox })).resolves.toBe(
        'README.md\nsrc/',
      );
    });

    it('reports empty directories', async () => {
      await expect(tool.execute({ path: '.' }, context)).resolves.toBe(
        '(empty directory)',
      );
    });

    it('converts sandbox listing failures into tool errors', async () => {
      sandbox = fakeSandbox({
        listEntries: jest.fn().mockRejectedValue(new Error('no dir')),
      });
      await expect(
        tool.execute({ path: 'missing' }, { sandbox }),
      ).rejects.toThrow(ToolExecutionError);
    });
  });

  describe('BashTool', () => {
    const tool = new BashTool();

    it('runs the command in the sandbox and returns its output', async () => {
      await expect(tool.execute({ command: 'echo hi' }, context)).resolves.toBe(
        'ok',
      );
      expect(sandbox.runCommand).toHaveBeenCalledWith('echo hi');
    });

    it('returns failing command output rather than throwing', async () => {
      sandbox = fakeSandbox({
        runCommand: jest.fn().mockResolvedValue({
          output: 'Command exited with code 1\nboom',
          isError: true,
        }),
      });
      await expect(
        tool.execute({ command: 'false' }, { sandbox }),
      ).resolves.toContain('exited with code 1');
    });

    it('rejects a missing command argument', async () => {
      await expect(tool.execute({}, context)).rejects.toThrow(
        ToolExecutionError,
      );
    });
  });
});
