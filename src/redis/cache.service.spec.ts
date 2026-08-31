import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

describe('CacheService', () => {
  let store: Map<string, string>;
  let redis: {
    client: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  };
  let cache: CacheService;

  beforeEach(() => {
    store = new Map<string, string>();
    redis = {
      client: {
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: jest.fn((key: string, value: string) => {
          store.set(key, value);
          return Promise.resolve('OK');
        }),
        del: jest.fn((key: string) => {
          store.delete(key);
          return Promise.resolve(1);
        }),
      },
    };
    cache = new CacheService(redis as unknown as RedisService);
  });

  it('round-trips JSON values', async () => {
    await cache.setJson('k', { a: 1 }, 60);
    await expect(cache.getJson<{ a: number }>('k')).resolves.toEqual({ a: 1 });
    expect(redis.client.set).toHaveBeenCalledWith(
      'k',
      JSON.stringify({ a: 1 }),
      'EX',
      60,
    );
  });

  it('returns null for missing keys', async () => {
    await expect(cache.getJson('missing')).resolves.toBeNull();
  });

  it('deletes keys', async () => {
    await cache.setJson('k', { a: 1 }, 60);
    await cache.delete('k');
    await expect(cache.getJson('k')).resolves.toBeNull();
  });

  it('propagates Redis failures instead of falling back', async () => {
    redis.client.get.mockRejectedValueOnce(new Error('redis down'));
    await expect(cache.getJson('k')).rejects.toThrow('redis down');
  });
});
