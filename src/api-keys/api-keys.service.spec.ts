import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKey } from '@prisma/client';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  const stored = new Map<string, ApiKey>();

  const prismaMock = {
    apiKey: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<ApiKey, 'id' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>;
        }) => {
          const record: ApiKey = {
            id: `id-${stored.size + 1}`,
            createdAt: new Date(),
            lastUsedAt: null,
            revokedAt: null,
            ...data,
          };
          stored.set(record.prefix, record);
          return Promise.resolve(record);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { prefix: string } }) =>
        Promise.resolve(stored.get(where.prefix) ?? null),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Partial<ApiKey> }) => {
          const record = [...stored.values()].find((k) => k.id === where.id);
          if (!record) {
            return Promise.reject(new Error('not found'));
          }
          Object.assign(record, data);
          return Promise.resolve(record);
        },
      ),
    },
  };

  const auditMock = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    stored.clear();
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = moduleRef.get(ApiKeysService);
  });

  it('issues a key whose secret authenticates successfully', async () => {
    const issued = await service.create('org-1', 'user-1', { name: 'ci' });
    expect(issued.secret).toMatch(/^sk_[0-9a-f]{12}\.[0-9a-f]{64}$/);
    const key = await service.authenticate(issued.secret);
    expect(key.id).toBe(issued.id);
  });

  it('rejects an unknown secret', async () => {
    await expect(service.authenticate('sk_deadbeef0000.bad')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a tampered secret with a valid prefix', async () => {
    const issued = await service.create('org-1', 'user-1', { name: 'ci' });
    const tampered = `${issued.prefix}.${'0'.repeat(64)}`;
    await expect(service.authenticate(tampered)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('never returns the hashed secret from create', async () => {
    const issued = await service.create('org-1', 'user-1', { name: 'ci' });
    expect(Object.keys(issued)).toEqual([
      'id',
      'name',
      'secret',
      'prefix',
      'createdAt',
    ]);
  });
});
