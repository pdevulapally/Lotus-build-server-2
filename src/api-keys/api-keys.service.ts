import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

const KEY_PREFIX = 'sk';

export interface IssuedApiKey {
  id: string;
  name: string;
  /** Full secret, shown exactly once at creation time. */
  secret: string;
  prefix: string;
  createdAt: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  async create(
    organizationId: string,
    createdById: string,
    dto: CreateApiKeyDto,
  ): Promise<IssuedApiKey> {
    const prefix = `${KEY_PREFIX}_${randomBytes(6).toString('hex')}`;
    const secretBody = randomBytes(32).toString('hex');
    const secret = `${prefix}.${secretBody}`;
    const record = await this.prisma.apiKey.create({
      data: {
        organizationId,
        createdById,
        name: dto.name,
        prefix,
        hashedSecret: this.hash(secret),
      },
    });
    await this.audit.record({
      organizationId,
      actorId: createdById,
      action: 'api_key.created',
      targetType: 'api_key',
      targetId: record.id,
    });
    return {
      id: record.id,
      name: record.name,
      secret,
      prefix,
      createdAt: record.createdAt,
    };
  }

  async list(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(
    organizationId: string,
    apiKeyId: string,
    actorId: string,
  ): Promise<void> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId, revokedAt: null },
    });
    if (!key) {
      throw new NotFoundException('API key not found or already revoked');
    }
    await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      organizationId,
      actorId,
      action: 'api_key.revoked',
      targetType: 'api_key',
      targetId: apiKeyId,
    });
  }

  async authenticate(secret: string): Promise<ApiKey> {
    const separatorIndex = secret.indexOf('.');
    if (separatorIndex <= 0) {
      throw new UnauthorizedException('Malformed API key');
    }
    const prefix = secret.slice(0, separatorIndex);
    const key = await this.prisma.apiKey.findUnique({ where: { prefix } });
    if (!key || key.revokedAt) {
      throw new UnauthorizedException('Invalid API key');
    }
    const provided = Buffer.from(this.hash(secret), 'hex');
    const stored = Buffer.from(key.hashedSecret, 'hex');
    if (
      provided.length !== stored.length ||
      !timingSafeEqual(provided, stored)
    ) {
      throw new UnauthorizedException('Invalid API key');
    }
    await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });
    return key;
  }
}
