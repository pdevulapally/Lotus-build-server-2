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
  Sse,
  UseGuards,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { OrgMembershipGuard } from '../auth/org-membership.guard';
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
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAgentRunDto,
  ) {
    return this.runsService.create(organizationId, sessionId, user.id, dto);
  }

  @Get('sessions/:sessionId/agent-runs')
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.runsService.list(organizationId, sessionId);
  }

  @Get('agent-runs/:runId')
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.runsService.getById(organizationId, runId);
  }

  @Get('agent-runs/:runId/steps')
  listSteps(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.runsService.listSteps(organizationId, runId);
  }

  @Post('agent-runs/:runId/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  cancel(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.runsService.cancel(organizationId, runId, user.id);
  }

  @Sse('agent-runs/:runId/events')
  async events(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<Observable<MessageEvent>> {
    await this.runsService.getById(organizationId, runId);
    return this.eventsService.observe(runId).pipe(
      map((event) => ({
        type: event.type,
        data: event.data,
      })),
    );
  }
}
