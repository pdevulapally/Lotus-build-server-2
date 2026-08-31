import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CacheService } from './cache.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Global()
@Module({
  providers: [RedisService, CacheService, RedisThrottlerStorage],
  exports: [RedisService, CacheService, RedisThrottlerStorage],
})
export class RedisModule {}
