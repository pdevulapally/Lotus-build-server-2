import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { CurrentActor } from '../auth/current-actor.decorator';
import { OrgActor } from '../auth/auth.types';
import { OrgMembershipGuard } from '../auth/org-membership.guard';
import { PaginationQueryDto } from '../common/pagination';
import { AgentRunsService } from './agent-runs.service';
import { AgentEventsService } from './agent-events.service';
import { CreateAgentRunDto } from './dto/create-agent-run.dto';

@Controller('organizations/:organizationId')
@UseGuards(OrgMembershipGuard)
export class AgentController {
  constructor(
    private readonly runsService: AgentRunsService,
    private readonly eventsService: AgentEventsService,
  ) {}

  @Post('sessions/:sessionId/agent-runs')
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentActor() actor: OrgActor,
    @Body() dto: CreateAgentRunDto,
  ) {
    return this.runsService.create(organizationId, sessionId, actor, dto);
  }

  @Get('sessions/:sessionId/agent-runs')
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentActor() actor: OrgActor,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.runsService.list(organizationId, sessionId, actor, pagination);
  }

  @Get('agent-runs/:runId')
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentActor() actor: OrgActor,
  ) {
    return this.runsService.getById(organizationId, runId, actor);
  }

  @Get('agent-runs/:runId/steps')
  listSteps(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentActor() actor: OrgActor,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.runsService.listSteps(organizationId, runId, actor, pagination);
  }

  @Post('agent-runs/:runId/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  cancel(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentActor() actor: OrgActor,
  ) {
    return this.runsService.cancel(organizationId, runId, actor);
  }

  @Sse('agent-runs/:runId/events')
  async events(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentActor() actor: OrgActor,
  ): Promise<Observable<MessageEvent>> {
    await this.runsService.getById(organizationId, runId, actor);
    const stream = await this.eventsService.observe(runId);
    return stream.pipe(
      map((event) => ({
        type: event.type,
        data: event.data,
      })),
    );
  }
}
