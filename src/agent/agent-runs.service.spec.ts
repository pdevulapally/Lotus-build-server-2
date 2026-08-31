import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';
import { OrgActor } from '../auth/auth.types';
import { AgentRunsService } from './agent-runs.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AgentLoopService } from './agent-loop.service';
import { AgentRunQueue } from './agent-run.queue';
import { FirestoreMirrorService } from '../firebase/firestore-mirror.service';
import { Env } from '../config/env.validation';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OWNER_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('AgentRunsService authorization', () => {
  let service: AgentRunsService;
  let runFindFirst: jest.Mock;

  const memberActor = (userId: string): OrgActor => ({
    userId,
    role: MembershipRole.MEMBER,
  });

  beforeEach(() => {
    runFindFirst = jest.fn();
    const prisma = {
      agentRun: { findFirst: runFindFirst },
      session: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn().mockReturnValue('claude-test-model'),
    } as unknown as ConfigService<Env, true>;
    service = new AgentRunsService(
      config,
      prisma,
      { record: jest.fn() } as unknown as AuditService,
      { requestCancellation: jest.fn() } as unknown as AgentLoopService,
      { enqueue: jest.fn() } as unknown as AgentRunQueue,
      { setRun: jest.fn() } as unknown as FirestoreMirrorService,
    );
  });

  it('constrains member run lookups to sessions they created', async () => {
    runFindFirst.mockResolvedValue(null);
    await expect(
      service.getById(ORG_ID, RUN_ID, memberActor(OTHER_USER_ID)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(runFindFirst).toHaveBeenCalledWith({
      where: {
        id: RUN_ID,
        organizationId: ORG_ID,
        session: { is: { creatorId: OTHER_USER_ID } },
      },
    });
  });

  it('does not add a creator constraint for OWNER/ADMIN', async () => {
    runFindFirst.mockResolvedValue({ id: RUN_ID });
    await service.getById(ORG_ID, RUN_ID, {
      userId: OWNER_USER_ID,
      role: MembershipRole.ADMIN,
    });
    expect(runFindFirst).toHaveBeenCalledWith({
      where: { id: RUN_ID, organizationId: ORG_ID },
    });
  });
});
