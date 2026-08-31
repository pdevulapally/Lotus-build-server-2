import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MembershipRole,
  MessageRole,
  Session,
  SessionStatus,
} from '@prisma/client';
import { OrgActor } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPage,
  DEFAULT_PAGE_SIZE,
  Page,
  PaginationQueryDto,
} from '../common/pagination';
import { FirestoreMirrorService } from '../firebase/firestore-mirror.service';
import { AuditService } from '../audit/audit.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mirror: FirestoreMirrorService,
  ) {}

  async create(
    organizationId: string,
    creatorId: string,
    dto: CreateSessionDto,
  ): Promise<Session> {
    const session = await this.prisma.session.create({
      data: { organizationId, creatorId, title: dto.title },
    });
    await this.audit.record({
      organizationId,
      actorId: creatorId,
      action: 'session.created',
      targetType: 'session',
      targetId: session.id,
    });
    return session;
  }

  /**
   * Sessions are private to their creator: regular members can only see and
   * act on sessions they created, while org OWNER/ADMIN roles have access to
   * all sessions in the organization. Non-accessible sessions behave as if
   * they do not exist (404), so IDs cannot be probed via the URL.
   */
  private static canAccess(session: Session, actor: OrgActor): boolean {
    return (
      actor.role !== MembershipRole.MEMBER || session.creatorId === actor.userId
    );
  }

  async list(
    organizationId: string,
    actor: OrgActor,
    pagination: PaginationQueryDto,
    status?: SessionStatus,
  ): Promise<Page<Session>> {
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.session.findMany({
      where: {
        organizationId,
        status: status ?? { not: SessionStatus.DELETED },
        ...(actor.role === MembershipRole.MEMBER
          ? { creatorId: actor.userId }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      ...(pagination.cursor
        ? { cursor: { id: pagination.cursor }, skip: 1 }
        : {}),
    });
    return buildPage(rows, limit);
  }

  async getById(
    organizationId: string,
    sessionId: string,
    actor: OrgActor,
  ): Promise<Session> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session || !SessionsService.canAccess(session, actor)) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  async update(
    organizationId: string,
    sessionId: string,
    actor: OrgActor,
    dto: UpdateSessionDto,
  ): Promise<Session> {
    await this.getById(organizationId, sessionId, actor);
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { title: dto.title, status: dto.status },
    });
    await this.audit.record({
      organizationId,
      actorId: actor.userId,
      action: 'session.updated',
      targetType: 'session',
      targetId: sessionId,
      metadata: { ...dto },
    });
    return session;
  }

  async listMessages(
    organizationId: string,
    sessionId: string,
    actor: OrgActor,
    pagination: PaginationQueryDto,
  ) {
    await this.getById(organizationId, sessionId, actor);
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(pagination.cursor
        ? { cursor: { id: pagination.cursor }, skip: 1 }
        : {}),
    });
    return buildPage(rows, limit);
  }

  async createMessage(
    organizationId: string,
    sessionId: string,
    actor: OrgActor,
    dto: CreateMessageDto,
  ) {
    await this.getById(organizationId, sessionId, actor);
    const message = await this.prisma.message.create({
      data: {
        sessionId,
        authorId: dto.role === MessageRole.USER ? actor.userId : null,
        role: dto.role,
        content: dto.content,
      },
    });
    await this.mirror.addMessage(message.id, {
      sessionId,
      organizationId,
      authorId: message.authorId,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    });
    return message;
  }
}
