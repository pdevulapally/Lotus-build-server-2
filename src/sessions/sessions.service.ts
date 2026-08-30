import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole, Session, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

  async list(organizationId: string, status?: SessionStatus) {
    return this.prisma.session.findMany({
      where: {
        organizationId,
        status: status ?? { not: SessionStatus.DELETED },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getById(organizationId: string, sessionId: string): Promise<Session> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  async update(
    organizationId: string,
    sessionId: string,
    actorId: string,
    dto: UpdateSessionDto,
  ): Promise<Session> {
    await this.getById(organizationId, sessionId);
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { title: dto.title, status: dto.status },
    });
    await this.audit.record({
      organizationId,
      actorId,
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
    limit: number,
    cursor?: string,
  ) {
    await this.getById(organizationId, sessionId);
    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async createMessage(
    organizationId: string,
    sessionId: string,
    authorId: string,
    dto: CreateMessageDto,
  ) {
    await this.getById(organizationId, sessionId);
    const message = await this.prisma.message.create({
      data: {
        sessionId,
        authorId: dto.role === MessageRole.USER ? authorId : null,
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
