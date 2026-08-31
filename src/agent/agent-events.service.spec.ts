import { firstValueFrom, toArray } from 'rxjs';
import { RedisService } from '../redis/redis.service';
import { AgentEvent, AgentEventsService } from './agent-events.service';

type MessageHandler = (channel: string, message: string) => void;

describe('AgentEventsService', () => {
  let handlers: MessageHandler[];
  let subscriber: {
    on: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };
  let publish: jest.Mock;
  let redis: { client: { publish: jest.Mock }; createClient: jest.Mock };
  let service: AgentEventsService;

  const deliver = (channel: string, message: string) => {
    for (const handler of handlers) {
      handler(channel, message);
    }
  };

  beforeEach(() => {
    handlers = [];
    subscriber = {
      on: jest.fn((event: string, handler: MessageHandler) => {
        if (event === 'message') {
          handlers.push(handler);
        }
      }),
      subscribe: jest.fn().mockResolvedValue(1),
      unsubscribe: jest.fn().mockResolvedValue(0),
    };
    publish = jest.fn((channel: string, message: string) => {
      deliver(channel, message);
      return Promise.resolve(1);
    });
    redis = {
      client: { publish },
      createClient: jest.fn().mockReturnValue(subscriber),
    };
    service = new AgentEventsService(redis as unknown as RedisService);
    service.onModuleInit();
  });

  it('publishes events on the run channel', async () => {
    const event: AgentEvent = {
      type: 'run_started',
      runId: 'run-1',
      data: { prompt: 'go' },
    };

    await service.emit(event);

    expect(publish).toHaveBeenCalledWith(
      'agent-events:run-1',
      JSON.stringify(event),
    );
  });

  it('delivers published events to observers and completes the stream', async () => {
    const stream = await service.observe('run-1');
    const collected = firstValueFrom(stream.pipe(toArray()));

    await service.emit({ type: 'assistant_text', runId: 'run-1', data: {} });
    await service.emit({ type: 'run_completed', runId: 'run-1', data: {} });
    await service.complete('run-1');

    const events = await collected;
    expect(events.map((event) => event.type)).toEqual([
      'assistant_text',
      'run_completed',
    ]);
    expect(subscriber.subscribe).toHaveBeenCalledWith('agent-events:run-1');
    expect(subscriber.unsubscribe).toHaveBeenCalledWith('agent-events:run-1');
  });

  it('ignores events for runs without observers', async () => {
    await service.emit({ type: 'assistant_text', runId: 'other', data: {} });
    expect(subscriber.subscribe).not.toHaveBeenCalled();
  });
});
