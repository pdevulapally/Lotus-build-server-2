import { ConfigService } from '@nestjs/config';
import { AgentRunStatus } from '@prisma/client';
import { Env } from '../config/env.validation';
import { FirestoreMirrorService } from '../firebase/firestore-mirror.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../metrics/metrics.service';
import { AgentEventsService } from './agent-events.service';
import { AgentLoopService } from './agent-loop.service';
import { SandboxHandle, SandboxService } from './sandbox/sandbox.service';
import { ToolRegistryService } from './tools/tool-registry.service';

const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

const RUN_ID = 'run-1';

function textResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
  };
}

function toolUseResponse(name: string, input: Record<string, unknown>) {
  return {
    content: [{ type: 'tool_use', id: 'tu-1', name, input }],
    stop_reason: 'tool_use',
  };
}

describe('AgentLoopService', () => {
  let service: AgentLoopService;
  let prisma: {
    agentRun: { update: jest.Mock };
    agentStep: { create: jest.Mock };
  };
  let events: { emit: jest.Mock; complete: jest.Mock };
  let tools: { definitions: unknown[]; execute: jest.Mock };
  let mirror: { updateRun: jest.Mock; addStep: jest.Mock };
  let sandbox: SandboxHandle;
  let sandboxes: { create: jest.Mock };
  let redisKeys: Set<string>;
  let redis: { client: { set: jest.Mock; exists: jest.Mock; del: jest.Mock } };
  let metrics: { agentRunsTotal: { inc: jest.Mock } };
  let maxIterations: number;

  beforeEach(() => {
    jest.clearAllMocks();
    maxIterations = 5;
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          ANTHROPIC_API_KEY: 'key',
          ANTHROPIC_MODEL: 'model',
          AGENT_MAX_ITERATIONS: maxIterations,
        };
        return values[key];
      }),
    } as unknown as ConfigService<Env, true>;
    prisma = {
      agentRun: { update: jest.fn().mockResolvedValue({}) },
      agentStep: {
        create: jest.fn().mockResolvedValue({ createdAt: new Date() }),
      },
    };
    events = { emit: jest.fn(), complete: jest.fn() };
    tools = {
      definitions: [],
      execute: jest.fn().mockResolvedValue({ content: 'ok', isError: false }),
    };
    mirror = {
      updateRun: jest.fn().mockResolvedValue(undefined),
      addStep: jest.fn().mockResolvedValue(undefined),
    };
    sandbox = {
      sandboxId: 'sbx-1',
      runCommand: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      listEntries: jest.fn(),
      kill: jest.fn().mockResolvedValue(undefined),
    };
    sandboxes = { create: jest.fn().mockResolvedValue(sandbox) };
    redisKeys = new Set<string>();
    redis = {
      client: {
        set: jest.fn((key: string) => {
          redisKeys.add(key);
          return Promise.resolve('OK');
        }),
        exists: jest.fn((key: string) =>
          Promise.resolve(redisKeys.has(key) ? 1 : 0),
        ),
        del: jest.fn((key: string) => {
          redisKeys.delete(key);
          return Promise.resolve(1);
        }),
      },
    };
    metrics = { agentRunsTotal: { inc: jest.fn() } };
    service = new AgentLoopService(
      configService,
      prisma as unknown as PrismaService,
      events as unknown as AgentEventsService,
      tools as unknown as ToolRegistryService,
      sandboxes as unknown as SandboxService,
      mirror as unknown as FirestoreMirrorService,
      redis as unknown as RedisService,
      metrics as unknown as MetricsService,
    );
  });

  it('completes a run and kills the sandbox when the model finishes', async () => {
    mockMessagesCreate.mockResolvedValueOnce(textResponse('done'));

    await service.execute(RUN_ID, 'do the thing');

    expect(sandboxes.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { sandboxId: 'sbx-1' },
    });
    expect(prisma.agentRun.update).toHaveBeenLastCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({ status: AgentRunStatus.COMPLETED }),
    });
    expect(mirror.updateRun).toHaveBeenLastCalledWith(
      RUN_ID,
      expect.objectContaining({ status: AgentRunStatus.COMPLETED }),
    );
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
    expect(events.complete).toHaveBeenCalledWith(RUN_ID);
  });

  it('executes tool calls and feeds results back to the model', async () => {
    mockMessagesCreate
      .mockResolvedValueOnce(toolUseResponse('bash', { command: 'ls' }))
      .mockResolvedValueOnce(textResponse('all done'));

    await service.execute(RUN_ID, 'list files');

    expect(tools.execute).toHaveBeenCalledWith(
      'bash',
      { command: 'ls' },
      { sandbox },
    );
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    const secondCall = mockMessagesCreate.mock.calls[1]?.[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(secondCall.messages[2]?.role).toBe('user');
    // steps: TOOL_CALL, TOOL_RESULT, ASSISTANT
    expect(prisma.agentStep.create).toHaveBeenCalledTimes(3);
    expect(mirror.addStep).toHaveBeenCalledTimes(3);
  });

  it('marks the run FAILED and kills the sandbox when the model call throws', async () => {
    mockMessagesCreate.mockRejectedValueOnce(new Error('api down'));

    await service.execute(RUN_ID, 'prompt');

    expect(prisma.agentRun.update).toHaveBeenLastCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({
        status: AgentRunStatus.FAILED,
        error: 'api down',
      }),
    });
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run_failed' }),
    );
  });

  it('marks the run FAILED when the Firestore mirror write fails', async () => {
    mockMessagesCreate.mockResolvedValueOnce(textResponse('done'));
    mirror.addStep.mockRejectedValueOnce(new Error('firestore down'));

    await service.execute(RUN_ID, 'prompt');

    expect(prisma.agentRun.update).toHaveBeenLastCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({
        status: AgentRunStatus.FAILED,
        error: 'firestore down',
      }),
    });
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
  });

  it('fails the run when the sandbox cannot be created', async () => {
    sandboxes.create.mockRejectedValueOnce(new Error('e2b unavailable'));

    await service.execute(RUN_ID, 'prompt');

    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(prisma.agentRun.update).toHaveBeenLastCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({
        status: AgentRunStatus.FAILED,
        error: 'e2b unavailable',
      }),
    });
  });

  it('cancels a run between iterations', async () => {
    await service.requestCancellation(RUN_ID);
    mockMessagesCreate.mockResolvedValue(textResponse('never used'));

    await service.execute(RUN_ID, 'prompt');

    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(prisma.agentRun.update).toHaveBeenLastCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({ status: AgentRunStatus.CANCELLED }),
    });
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run_cancelled' }),
    );
    expect(redis.client.del).toHaveBeenCalledWith(`agent-cancel:${RUN_ID}`);
    expect(metrics.agentRunsTotal.inc).toHaveBeenCalledWith({
      status: AgentRunStatus.CANCELLED,
    });
  });

  it('fails the run when the iteration limit is exceeded', async () => {
    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('bash', { command: 'ls' }),
    );

    await service.execute(RUN_ID, 'prompt');

    expect(mockMessagesCreate).toHaveBeenCalledTimes(maxIterations);
    expect(prisma.agentRun.update).toHaveBeenLastCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({
        status: AgentRunStatus.FAILED,
        error: expect.stringContaining('maximum'),
      }),
    });
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
  });
});
