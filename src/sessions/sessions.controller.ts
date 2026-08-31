import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentActor } from '../auth/current-actor.decorator';
import { OrgActor, RequestUser } from '../auth/auth.types';
import { OrgMembershipGuard } from '../auth/org-membership.guard';
import { PaginationQueryDto } from '../common/pagination';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListSessionsQueryDto } from './dto/list-sessions.query';

@Controller('organizations/:organizationId/sessions')
@UseGuards(OrgMembershipGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionsService.create(organizationId, user.id, dto);
  }

  @Get()
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentActor() actor: OrgActor,
    @Query() query: ListSessionsQueryDto,
  ) {
    return this.sessionsService.list(
      organizationId,
      actor,
      query,
      query.status,
    );
  }

  @Get(':sessionId')
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentActor() actor: OrgActor,
  ) {
    return this.sessionsService.getById(organizationId, sessionId, actor);
  }

  @Patch(':sessionId')
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentActor() actor: OrgActor,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.update(organizationId, sessionId, actor, dto);
  }

  @Get(':sessionId/messages')
  listMessages(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentActor() actor: OrgActor,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.sessionsService.listMessages(
      organizationId,
      sessionId,
      actor,
      pagination,
    );
  }

  @Post(':sessionId/messages')
  createMessage(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentActor() actor: OrgActor,
    @Body() dto: CreateMessageDto,
  ) {
    return this.sessionsService.createMessage(
      organizationId,
      sessionId,
      actor,
      dto,
    );
  }
}
