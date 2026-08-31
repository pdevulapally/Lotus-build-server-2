import { RedisThrottlerStorage } from './redis-throttler.storage';
import { RedisService } from './redis.service';

describe('RedisThrottlerStorage', () => {
  let evalResults: Array<[number, number, number, number]>;
  let evalMock: jest.Mock;
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    evalResults = [];
    evalMock = jest.fn(() => Promise.resolve(evalResults.shift()));
    const redis = { client: { eval: evalMock } };
    storage = new RedisThrottlerStorage(redis as unknown as RedisService);
  });

  it('reports hits below the limit as not blocked', async () => {
    evalResults.push([1, 60000, 0, 0]);

    const record = await storage.increment('ip-1', 60000, 5, 30000, 'default');

    expect(record.totalHits).toBe(1);
    expect(record.isBlocked).toBe(false);
    expect(record.timeToExpire).toBe(60);
  });

  it('reports blocked keys with the block expiry', async () => {
    evalResults.push([6, 60000, 1, 30000]);

    const record = await storage.increment('ip-1', 60000, 5, 30000, 'default');

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(30);
  });

  it('propagates Redis failures instead of allowing traffic', async () => {
    evalMock.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      storage.increment('ip-1', 60000, 5, 30000, 'default'),
    ).rejects.toThrow('redis down');
  });
});
