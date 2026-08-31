import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { AuthenticatedRequest } from './auth.types';
import { ORG_ROLES_KEY } from './org-roles.decorator';
import { MembershipCacheService } from './membership-cache.service';

@Injectable()
export class OrgMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly memberships: MembershipCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const organizationId = request.params['organizationId'];
    if (typeof organizationId !== 'string' || organizationId.length === 0) {
      throw new BadRequestException('Missing organizationId parameter');
    }

    const membership = await this.memberships.get(user.id, organizationId);
    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }
    request.orgActor = { userId: user.id, role: membership.role };

    const requiredRoles =
      this.reflector.getAllAndOverride<MembershipRole[] | undefined>(
        ORG_ROLES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    if (requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient role for this operation');
    }
    return true;
  }
}
