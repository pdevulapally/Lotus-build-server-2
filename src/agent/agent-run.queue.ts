import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { Env } from '../config/env.validation';
import { RedisService } from '../redis/redis.service';
import { AgentLoopService } from './agent-loop.service';

export const AGENT_RUN_QUEUE = 'agent-runs';

export interface AgentRunJobData {
  runId: string;
  prompt: string;
}

/**
 * Durable agent run execution: runs are enqueued as BullMQ jobs backed by
 * Redis, so they survive API process restarts and are distributed across
 * replicas with bounded concurrency.
 */
@Injectable()
export class AgentRunQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRunQueue.name);
  private readonly concurrency: number;
  private queue!: Queue<AgentRunJobData>;
  private worker!: Worker<AgentRunJobData>;

  constructor(
    configService: ConfigService<Env, true>,
    private readonly redis: RedisService,
    private readonly loop: AgentLoopService,
  ) {
    this.concurrency = configService.get('AGENT_QUEUE_CONCURRENCY', {
      infer: true,
    });
  }

  onModuleInit(): void {
    this.queue = new Queue<AgentRunJobData>(AGENT_RUN_QUEUE, {
      connection: this.redis.createClient('lotus-backend-queue'),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
    this.worker = new Worker<AgentRunJobData>(
      AGENT_RUN_QUEUE,
      (job: Job<AgentRunJobData>) =>
        this.loop.execute(job.data.runId, job.data.prompt),
      {
        connection: this.redis.createClient('lotus-backend-worker'),
        concurrency: this.concurrency,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { runId: job?.data.runId, err: error },
        'Agent run job failed',
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }

  async enqueue(data: AgentRunJobData): Promise<void> {
    await this.queue.add('execute', data, { jobId: data.runId });
  }
}
