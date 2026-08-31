import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { RedisService } from '../redis/redis.service';

export interface AgentEvent {
  type:
    | 'run_started'
    | 'assistant_text'
    | 'tool_call'
    | 'tool_result'
    | 'run_completed'
    | 'run_failed'
    | 'run_cancelled';
  runId: string;
  data: Record<string, unknown>;
}

interface StreamEndMarker {
  type: 'stream_end';
  runId: string;
}

type ChannelPayload = AgentEvent | StreamEndMarker;

const CHANNEL_PREFIX = 'agent-events:';

/**
 * Distributes agent run events across all API replicas through Redis
 * pub/sub, so SSE clients receive events regardless of which process
 * executes the run.
 */
@Injectable()
export class AgentEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentEventsService.name);
  private readonly subjects = new Map<string, Subject<AgentEvent>>();
  private subscriber!: Redis;

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    this.subscriber = this.redis.createClient('lotus-backend-agent-events');
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const subject of this.subjects.values()) {
      subject.complete();
    }
    this.subjects.clear();
  }

  private handleMessage(channel: string, message: string): void {
    if (!channel.startsWith(CHANNEL_PREFIX)) {
      return;
    }
    const runId = channel.slice(CHANNEL_PREFIX.length);
    const subject = this.subjects.get(runId);
    if (!subject) {
      return;
    }
    let payload: ChannelPayload;
    try {
      payload = JSON.parse(message) as ChannelPayload;
    } catch (error) {
      this.logger.error({ runId, err: error }, 'Malformed agent event payload');
      return;
    }
    if (payload.type === 'stream_end') {
      subject.complete();
      this.removeSubject(runId);
      return;
    }
    subject.next(payload);
  }

  private removeSubject(runId: string): void {
    if (this.subjects.delete(runId)) {
      void this.subscriber
        .unsubscribe(`${CHANNEL_PREFIX}${runId}`)
        .catch((error: unknown) => {
          this.logger.error({ runId, err: error }, 'Failed to unsubscribe');
        });
    }
  }

  async emit(event: AgentEvent): Promise<void> {
    await this.redis.client.publish(
      `${CHANNEL_PREFIX}${event.runId}`,
      JSON.stringify(event),
    );
  }

  async complete(runId: string): Promise<void> {
    const marker: StreamEndMarker = { type: 'stream_end', runId };
    await this.redis.client.publish(
      `${CHANNEL_PREFIX}${runId}`,
      JSON.stringify(marker),
    );
  }

  async observe(runId: string): Promise<Observable<AgentEvent>> {
    let subject = this.subjects.get(runId);
    if (!subject) {
      subject = new Subject<AgentEvent>();
      this.subjects.set(runId, subject);
      await this.subscriber.subscribe(`${CHANNEL_PREFIX}${runId}`);
    }
    return subject.asObservable();
  }
}
