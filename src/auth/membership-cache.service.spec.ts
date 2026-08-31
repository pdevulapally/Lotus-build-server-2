import { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';
import { Env } from '../config/env.validation';
import { CacheService } from '../redis/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipCacheService } from './membership-cache.service';

describe('MembershipCacheService', () => {
  let cacheStore: Map<string, unknown>;
  let cache: { getJson: jest.Mock; setJson: jest.Mock; delete: jest.Mock };
  let prisma: { membership: { findUnique: jest.Mock } };
  let service: MembershipCacheService;

  const KEY = 'membership:org-1:user-1';

  beforeEach(() => {
    cacheStore = new Map<string, unknown>();
    cache = {
      getJson: jest.fn((key: string) =>
        Promise.resolve(cacheStore.get(key) ?? null),
      ),
      setJson: jest.fn((key: string, value: unknown) => {
        cacheStore.set(key, value);
        return Promise.resolve();
      }),
      delete: jest.fn((key: string) => {
        cacheStore.delete(key);
        return Promise.resolve();
      }),
    };
    prisma = { membership: { findUnique: jest.fn() } };
    const configService = {
      get: jest.fn().mockReturnValue(30),
    } as unknown as ConfigService<Env, true>;
    service = new MembershipCacheService(
      configService,
      cache as unknown as CacheService,
      prisma as unknown as PrismaService,
    );
  });

  it('loads from the database and caches the role on a miss', async () => {
    prisma.membership.findUnique.mockResolvedValueOnce({
      role: MembershipRole.ADMIN,
    });

    const result = await service.get('user-1', 'org-1');

    expect(result).toEqual({ role: MembershipRole.ADMIN });
    expect(cache.setJson).toHaveBeenCalledWith(
      KEY,
      { role: MembershipRole.ADMIN },
      30,
    );
  });

  it('serves from the cache without hitting the database', async () => {
    cacheStore.set(KEY, { role: MembershipRole.MEMBER });

    const result = await service.get('user-1', 'org-1');

    expect(result).toEqual({ role: MembershipRole.MEMBER });
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('never caches missing memberships', async () => {
    prisma.membership.findUnique.mockResolvedValueOnce(null);

    const result = await service.get('user-1', 'org-1');

    expect(result).toBeNull();
    expect(cache.setJson).not.toHaveBeenCalled();
  });

  it('invalidates the cached entry', async () => {
    cacheStore.set(KEY, { role: MembershipRole.MEMBER });

    await service.invalidate('user-1', 'org-1');

    expect(cache.delete).toHaveBeenCalledWith(KEY);
    expect(cacheStore.has(KEY)).toBe(false);
  });
});
