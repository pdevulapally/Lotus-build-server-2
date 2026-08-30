import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { OrgMembershipGuard } from '../auth/org-membership.guard';
import { OrgRoles } from '../auth/org-roles.decorator';
import { AuditService } from '../audit/audit.service';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.organizationsService.listForUser(user.id);
  }

  @Get(':organizationId')
  @UseGuards(OrgMembershipGuard)
  get(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.organizationsService.getById(organizationId);
  }

  @Get(':organizationId/members')
  @UseGuards(OrgMembershipGuard)
  listMembers(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.organizationsService.listMembers(organizationId);
  }

  @Post(':organizationId/members')
  @UseGuards(OrgMembershipGuard)
  @OrgRoles(MembershipRole.OWNER, MembershipRole.ADMIN)
  addMember(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AddMemberDto,
  ) {
    return this.organizationsService.addMember(organizationId, user.id, dto);
  }

  @Get(':organizationId/audit-logs')
  @UseGuards(OrgMembershipGuard)
  @OrgRoles(MembershipRole.OWNER, MembershipRole.ADMIN)
  listAuditLogs(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.auditService.listForOrganization(
      organizationId,
      Math.min(Math.max(limit, 1), 200),
    );
  }
}
