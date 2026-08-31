import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { Env, validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage';
import { MetricsModule } from './metrics/metrics.module';
import { FirebaseModule } from './firebase/firebase.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SessionsModule } from './sessions/sessions.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { HealthModule } from './health/health.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level:
            config.get('NODE_ENV', { infer: true }) === 'production'
              ? 'info'
              : 'debug',
          redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (
        config: ConfigService<Env, true>,
        storage: RedisThrottlerStorage,
      ) => ({
        throttlers: [
          {
            ttl: config.get('RATE_LIMIT_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.get('RATE_LIMIT_MAX', { infer: true }),
          },
        ],
        storage,
      }),
    }),
    RedisModule,
    PrismaModule,
    FirebaseModule,
    AuditModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    SessionsModule,
    ApiKeysModule,
    AgentModule,
    MetricsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
