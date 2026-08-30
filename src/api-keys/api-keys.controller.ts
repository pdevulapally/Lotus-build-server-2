import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { OrgMembershipGuard } from '../auth/org-membership.guard';
import { OrgRoles } from '../auth/org-roles.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('organizations/:organizationId/api-keys')
@UseGuards(OrgMembershipGuard)
@OrgRoles(MembershipRole.OWNER, MembershipRole.ADMIN)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(organizationId, user.id, dto);
  }

  @Get()
  list(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.apiKeysService.list(organizationId);
  }

  @Delete(':apiKeyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('apiKeyId', ParseUUIDPipe) apiKeyId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.apiKeysService.revoke(organizationId, apiKeyId, user.id);
  }
}
