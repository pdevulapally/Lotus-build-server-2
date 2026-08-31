import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentRun,
  AgentRunStatus,
  AgentStep,
  MembershipRole,
} from '@prisma/client';
import { OrgActor } from '../auth/auth.types';
import { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { FirestoreMirrorService } from '../firebase/firestore-mirror.service';
import { AuditService } from '../audit/audit.service';
import {
  buildPage,
  DEFAULT_PAGE_SIZE,
  Page,
  PaginationQueryDto,
} from '../common/pagination';
import { AgentLoopService } from './agent-loop.service';
import { AgentRunQueue } from './agent-run.queue';
import { CreateAgentRunDto } from './dto/create-agent-run.dto';

@Injectable()
export class AgentRunsService {
  private readonly model: string;

  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loop: AgentLoopService,
    private readonly queue: AgentRunQueue,
    private readonly mirror: FirestoreMirrorService,
  ) {
    this.model = configService.get('ANTHROPIC_MODEL', { infer: true });
  }

  /**
   * Agent runs inherit the privacy of the session they belong to: regular
   * members can only reach runs on sessions they created; OWNER/ADMIN can
   * reach all runs in the organization. Inaccessible runs return 404 so run
   * IDs cannot be probed via the URL.
   */
  private static sessionScope(actor: OrgActor) {
    return actor.role === MembershipRole.MEMBER
      ? { session: { is: { creatorId: actor.userId } } }
      : {};
  }

  async create(
    organizationId: string,
    sessionId: string,
    actor: OrgActor,
    dto: CreateAgentRunDto,
  ): Promise<AgentRun> {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        organizationId,
        ...(actor.role === MembershipRole.MEMBER
          ? { creatorId: actor.userId }
          : {}),
      },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    const creatorId = actor.userId;
    const run = await this.prisma.agentRun.create({
      data: {
        organizationId,
        sessionId,
        creatorId,
        prompt: dto.prompt,
        model: this.model,
      },
    });
    try {
      await this.mirror.setRun(run.id, {
        organizationId,
        sessionId,
        sessionCreatorId: session.creatorId,
        creatorId,
        prompt: run.prompt,
        model: run.model,
        status: run.status,
        error: null,
        sandboxId: null,
        startedAt: run.startedAt,
        finishedAt: null,
      });
    } catch (error) {
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: AgentRunStatus.FAILED,
          error: 'Failed to mirror run to Firestore',
          finishedAt: new Date(),
        },
      });
      throw error;
    }
    await this.audit.record({
      organizationId,
      actorId: creatorId,
      action: 'agent_run.created',
      targetType: 'agent_run',
      targetId: run.id,
    });
    try {
      await this.queue.enqueue({ runId: run.id, prompt: dto.prompt });
    } catch (error) {
      const failure = {
        status: AgentRunStatus.FAILED,
        error: 'Failed to enqueue agent run for execution',
        finishedAt: new Date(),
      };
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: failure,
      });
      await this.mirror.updateRun(run.id, failure);
      throw error;
    }
    return run;
  }

  async list(
    organizationId: string,
    sessionId: string,
    actor: OrgActor,
    pagination: PaginationQueryDto,
  ): Promise<Page<AgentRun>> {
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.agentRun.findMany({
      where: {
        organizationId,
        sessionId,
        ...AgentRunsService.sessionScope(actor),
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(pagination.cursor
        ? { cursor: { id: pagination.cursor }, skip: 1 }
        : {}),
    });
    return buildPage(rows, limit);
  }

  async getById(
    organizationId: string,
    runId: string,
    actor: OrgActor,
  ): Promise<AgentRun> {
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: runId,
        organizationId,
        ...AgentRunsService.sessionScope(actor),
      },
    });
    if (!run) {
      throw new NotFoundException('Agent run not found');
    }
    return run;
  }

  async listSteps(
    organizationId: string,
    runId: string,
    actor: OrgActor,
    pagination: PaginationQueryDto,
  ): Promise<Page<AgentStep>> {
    await this.getById(organizationId, runId, actor);
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.agentStep.findMany({
      where: { runId },
      orderBy: { index: 'asc' },
      take: limit + 1,
      ...(pagination.cursor
        ? { cursor: { id: pagination.cursor }, skip: 1 }
        : {}),
    });
    return buildPage(rows, limit);
  }

  async cancel(
    organizationId: string,
    runId: string,
    actor: OrgActor,
  ): Promise<void> {
    const run = await this.getById(organizationId, runId, actor);
    if (run.status !== AgentRunStatus.RUNNING) {
      throw new ConflictException('Run is not currently running');
    }
    await this.loop.requestCancellation(runId);
    await this.audit.record({
      organizationId,
      actorId: actor.userId,
      action: 'agent_run.cancellation_requested',
      targetType: 'agent_run',
      targetId: runId,
    });
  }
}
