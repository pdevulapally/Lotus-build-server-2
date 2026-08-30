import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { OrgMembershipGuard } from '../auth/org-membership.guard';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { CreateMessageDto } from './dto/create-message.dto';

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
    @Query('status', new ParseEnumPipe(SessionStatus, { optional: true }))
    status?: SessionStatus,
  ) {
    return this.sessionsService.list(organizationId, status);
  }

  @Get(':sessionId')
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessionsService.getById(organizationId, sessionId);
  }

  @Patch(':sessionId')
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.update(organizationId, sessionId, user.id, dto);
  }

  @Get(':sessionId/messages')
  listMessages(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.sessionsService.listMessages(
      organizationId,
      sessionId,
      Math.min(Math.max(limit, 1), 200),
      cursor,
    );
  }

  @Post(':sessionId/messages')
  createMessage(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateMessageDto,
  ) {
    return this.sessionsService.createMessage(
      organizationId,
      sessionId,
      user.id,
      dto,
    );
  }
}
