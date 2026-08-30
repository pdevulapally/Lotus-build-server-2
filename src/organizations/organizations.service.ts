import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, Organization } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    creatorId: string,
    dto: CreateOrganizationDto,
  ): Promise<Organization> {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('An organization with this slug exists');
    }
    const organization = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: dto.name, slug: dto.slug },
      });
      await tx.membership.create({
        data: {
          userId: creatorId,
          organizationId: org.id,
          role: MembershipRole.OWNER,
        },
      });
      return org;
    });
    await this.audit.record({
      organizationId: organization.id,
      actorId: creatorId,
      action: 'organization.created',
      targetType: 'organization',
      targetId: organization.id,
    });
    return organization;
  }

  async listForUser(userId: string) {
    return this.prisma.organization.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(organizationId: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async listMembers(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(organizationId: string, actorId: string, dto: AddMemberDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new NotFoundException('No user found with this email');
    }
    const existing = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId },
      },
    });
    if (existing) {
      throw new ConflictException('User is already a member');
    }
    const membership = await this.prisma.membership.create({
      data: { userId: user.id, organizationId, role: dto.role },
    });
    await this.audit.record({
      organizationId,
      actorId,
      action: 'membership.created',
      targetType: 'membership',
      targetId: membership.id,
      metadata: { role: dto.role, userId: user.id },
    });
    return membership;
  }
}
