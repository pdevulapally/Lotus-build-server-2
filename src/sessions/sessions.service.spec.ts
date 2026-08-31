import { NotFoundException } from '@nestjs/common';
import {
  MembershipRole,
  MessageRole,
  Session,
  SessionStatus,
} from '@prisma/client';
import { OrgActor } from '../auth/auth.types';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FirestoreMirrorService } from '../firebase/firestore-mirror.service';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG_ID = '22222222-2222-2222-2222-222222222222';
const OWNER_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const session: Session = {
  id: SESSION_ID,
  organizationId: ORG_ID,
  creatorId: OWNER_USER_ID,
  title: 'private session',
  status: SessionStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SessionsService authorization', () => {
  let service: SessionsService;
  let findFirst: jest.Mock;
  let findMany: jest.Mock;

  const memberActor = (userId: string): OrgActor => ({
    userId,
    role: MembershipRole.MEMBER,
  });

  beforeEach(() => {
    findFirst = jest.fn();
    findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      session: { findFirst, findMany },
      message: { findMany, create: jest.fn() },
    } as unknown as PrismaService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const mirror = {
      addMessage: jest.fn(),
    } as unknown as FirestoreMirrorService;
    service = new SessionsService(prisma, audit, mirror);
    findFirst.mockImplementation(
      ({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === SESSION_ID && where.organizationId === ORG_ID
          ? Promise.resolve(session)
          : Promise.resolve(null),
    );
  });

  it('returns the session to its creator', async () => {
    await expect(
      service.getById(ORG_ID, SESSION_ID, memberActor(OWNER_USER_ID)),
    ).resolves.toEqual(session);
  });

  it('rejects another member of the same org with 404', async () => {
    await expect(
      service.getById(ORG_ID, SESSION_ID, memberActor(OTHER_USER_ID)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects access via a different organizationId in the URL', async () => {
    await expect(
      service.getById(OTHER_ORG_ID, SESSION_ID, memberActor(OWNER_USER_ID)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows org OWNER/ADMIN to access any session in the org', async () => {
    await expect(
      service.getById(ORG_ID, SESSION_ID, {
        userId: OTHER_USER_ID,
        role: MembershipRole.ADMIN,
      }),
    ).resolves.toEqual(session);
  });

  it('scopes list queries to the creator for regular members', async () => {
    await service.list(ORG_ID, memberActor(OTHER_USER_ID), {});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          creatorId: OTHER_USER_ID,
        }),
      }),
    );
  });

  it('does not scope list queries by creator for admins', async () => {
    await service.list(
      ORG_ID,
      {
        userId: OTHER_USER_ID,
        role: MembershipRole.OWNER,
      },
      {},
    );
    const where = (findMany.mock.calls[0][0] as { where: object }).where;
    expect(where).not.toHaveProperty('creatorId');
  });

  it("rejects listing messages of another user's session", async () => {
    await expect(
      service.listMessages(ORG_ID, SESSION_ID, memberActor(OTHER_USER_ID), {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects creating messages in another user's session", async () => {
    await expect(
      service.createMessage(ORG_ID, SESSION_ID, memberActor(OTHER_USER_ID), {
        role: MessageRole.USER,
        content: 'hi',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
