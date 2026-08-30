import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentRun, AgentRunStatus } from '@prisma/client';
import { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AgentLoopService } from './agent-loop.service';
import { CreateAgentRunDto } from './dto/create-agent-run.dto';

@Injectable()
export class AgentRunsService {
  private readonly model: string;

  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loop: AgentLoopService,
  ) {
    this.model = configService.get('ANTHROPIC_MODEL', { infer: true });
  }

  async create(
    organizationId: string,
    sessionId: string,
    creatorId: string,
    dto: CreateAgentRunDto,
  ): Promise<AgentRun> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    const run = await this.prisma.agentRun.create({
      data: {
        organizationId,
        sessionId,
        creatorId,
        prompt: dto.prompt,
        model: this.model,
      },
    });
    await this.audit.record({
      organizationId,
      actorId: creatorId,
      action: 'agent_run.created',
      targetType: 'agent_run',
      targetId: run.id,
    });
    void this.loop.execute(run.id, dto.prompt);
    return run;
  }

  async list(organizationId: string, sessionId: string) {
    return this.prisma.agentRun.findMany({
      where: { organizationId, sessionId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getById(organizationId: string, runId: string): Promise<AgentRun> {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run) {
      throw new NotFoundException('Agent run not found');
    }
    return run;
  }

  async listSteps(organizationId: string, runId: string) {
    await this.getById(organizationId, runId);
    return this.prisma.agentStep.findMany({
      where: { runId },
      orderBy: { index: 'asc' },
    });
  }

  async cancel(
    organizationId: string,
    runId: string,
    actorId: string,
  ): Promise<void> {
    const run = await this.getById(organizationId, runId);
    if (run.status !== AgentRunStatus.RUNNING) {
      throw new ConflictException('Run is not currently running');
    }
    this.loop.requestCancellation(runId);
    await this.audit.record({
      organizationId,
      actorId,
      action: 'agent_run.cancellation_requested',
      targetType: 'agent_run',
      targetId: runId,
    });
  }
}
