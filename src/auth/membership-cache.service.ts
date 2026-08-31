import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';
import { Env } from '../config/env.validation';
import { CacheService } from '../redis/cache.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CachedMembership {
  role: MembershipRole;
}

/**
 * Short-TTL Redis cache in front of the membership lookup performed on
 * every organization-scoped request. Entries are explicitly invalidated
 * whenever a membership changes; absence of membership is never cached.
 */
@Injectable()
export class MembershipCacheService {
  private readonly ttlSeconds: number;

  constructor(
    configService: ConfigService<Env, true>,
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
  ) {
    this.ttlSeconds = configService.get('MEMBERSHIP_CACHE_TTL_SECONDS', {
      infer: true,
    });
  }

  private key(userId: string, organizationId: string): string {
    return `membership:${organizationId}:${userId}`;
  }

  async get(
    userId: string,
    organizationId: string,
  ): Promise<CachedMembership | null> {
    const cached = await this.cache.getJson<CachedMembership>(
      this.key(userId, organizationId),
    );
    if (cached) {
      return cached;
    }
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership) {
      return null;
    }
    const entry: CachedMembership = { role: membership.role };
    await this.cache.setJson(
      this.key(userId, organizationId),
      entry,
      this.ttlSeconds,
    );
    return entry;
  }

  async invalidate(userId: string, organizationId: string): Promise<void> {
    await this.cache.delete(this.key(userId, organizationId));
  }
}
