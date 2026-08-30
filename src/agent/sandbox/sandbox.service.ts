import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandExitError, Sandbox } from 'e2b';
import { Env } from '../../config/env.validation';

export const SANDBOX_WORKSPACE_ROOT = '/home/user';

const MAX_OUTPUT_BYTES = 64 * 1024;

export interface SandboxCommandResult {
  output: string;
  isError: boolean;
}

export interface SandboxEntry {
  name: string;
  isDirectory: boolean;
}

/** A live handle to an isolated E2B cloud sandbox owned by one agent run. */
export interface SandboxHandle {
  readonly sandboxId: string;
  runCommand(command: string): Promise<SandboxCommandResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listEntries(path: string): Promise<SandboxEntry[]>;
  kill(): Promise<void>;
}

function truncate(text: string): string {
  if (Buffer.byteLength(text, 'utf-8') <= MAX_OUTPUT_BYTES) {
    return text;
  }
  return `${Buffer.from(text, 'utf-8')
    .subarray(0, MAX_OUTPUT_BYTES)
    .toString('utf-8')}\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
}

class E2bSandboxHandle implements SandboxHandle {
  constructor(
    private readonly sandbox: Sandbox,
    private readonly commandTimeoutMs: number,
  ) {}

  get sandboxId(): string {
    return this.sandbox.sandboxId;
  }

  async runCommand(command: string): Promise<SandboxCommandResult> {
    try {
      const result = await this.sandbox.commands.run(command, {
        cwd: SANDBOX_WORKSPACE_ROOT,
        timeoutMs: this.commandTimeoutMs,
      });
      const output = [result.stdout, result.stderr]
        .filter((part) => part.length > 0)
        .join('\n');
      return {
        output: truncate(output.length > 0 ? output : '(no output)'),
        isError: false,
      };
    } catch (error) {
      if (error instanceof CommandExitError) {
        const output = [error.stdout, error.stderr]
          .filter((part) => part.length > 0)
          .join('\n');
        return {
          output: truncate(
            `Command exited with code ${error.exitCode}\n${output}`.trim(),
          ),
          isError: true,
        };
      }
      throw error;
    }
  }

  async readFile(path: string): Promise<string> {
    return truncate(await this.sandbox.files.read(path));
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.sandbox.files.write(path, content);
  }

  async listEntries(path: string): Promise<SandboxEntry[]> {
    const entries = await this.sandbox.files.list(path);
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.type === 'dir',
    }));
  }

  async kill(): Promise<void> {
    await this.sandbox.kill();
  }
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly apiKey: string;
  private readonly sandboxTimeoutMs: number;
  private readonly commandTimeoutMs: number;

  constructor(configService: ConfigService<Env, true>) {
    this.apiKey = configService.get('E2B_API_KEY', { infer: true });
    this.sandboxTimeoutMs =
      configService.get('E2B_SANDBOX_TIMEOUT_SECONDS', { infer: true }) * 1000;
    this.commandTimeoutMs =
      configService.get('AGENT_TOOL_TIMEOUT_SECONDS', { infer: true }) * 1000;
  }

  async create(): Promise<SandboxHandle> {
    const sandbox = await Sandbox.create({
      apiKey: this.apiKey,
      timeoutMs: this.sandboxTimeoutMs,
    });
    this.logger.log(`Created sandbox ${sandbox.sandboxId}`);
    return new E2bSandboxHandle(sandbox, this.commandTimeoutMs);
  }
}
