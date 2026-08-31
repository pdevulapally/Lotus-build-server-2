import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';

const INCREMENT_SCRIPT = `
local hits_key = KEYS[1]
local block_key = KEYS[2]
local ttl_ms = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block_ms = tonumber(ARGV[3])

local block_ttl = redis.call('PTTL', block_key)
if block_ttl > 0 then
  local hits = tonumber(redis.call('GET', hits_key) or '0')
  local hits_ttl = redis.call('PTTL', hits_key)
  return {hits, hits_ttl, 1, block_ttl}
end

local hits = redis.call('INCR', hits_key)
if hits == 1 then
  redis.call('PEXPIRE', hits_key, ttl_ms)
end
local hits_ttl = redis.call('PTTL', hits_key)

if hits > limit and block_ms > 0 then
  redis.call('SET', block_key, '1', 'PX', block_ms)
  return {hits, hits_ttl, 1, block_ms}
end

return {hits, hits_ttl, 0, 0}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}:hits`;
    const blockKey = `throttle:${throttlerName}:${key}:block`;
    const reply = (await this.redis.client.eval(
      INCREMENT_SCRIPT,
      2,
      hitsKey,
      blockKey,
      String(ttl),
      String(limit),
      String(blockDuration),
    )) as [number, number, number, number];
    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = reply;
    return {
      totalHits,
      timeToExpire: Math.max(0, Math.ceil(timeToExpire / 1000)),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(timeToBlockExpire / 1000)),
    };
  }
}
