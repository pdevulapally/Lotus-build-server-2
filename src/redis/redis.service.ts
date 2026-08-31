import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Env } from '../config/env.validation';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly url: string;
  readonly client: Redis;
  private readonly extraClients: Redis[] = [];

  constructor(configService: ConfigService<Env, true>) {
    this.url = configService.get('REDIS_URL', { infer: true });
    this.client = this.buildClient();
  }

  private buildClient(): Redis {
    return new Redis(this.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectionName: 'lotus-backend',
    });
  }

  /** Creates an additional connection (subscriber, queue worker, ...). */
  createClient(connectionName: string): Redis {
    const client = new Redis(this.url, {
      maxRetriesPerRequest: null,
      connectionName,
    });
    this.extraClients.push(client);
    return client;
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    await this.client.ping();
    this.logger.log('Connected to Redis');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.client.quit(),
      ...this.extraClients.map((client) => client.quit()),
    ]);
  }

  async ping(): Promise<void> {
    const reply = await this.client.ping();
    if (reply !== 'PONG') {
      throw new Error(`Unexpected Redis PING reply: ${reply}`);
    }
  }
}
