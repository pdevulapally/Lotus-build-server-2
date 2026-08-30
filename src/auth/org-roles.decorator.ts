import { SetMetadata } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

export const ORG_ROLES_KEY = 'orgRoles';
export const OrgRoles = (...roles: MembershipRole[]) =>
  SetMetadata(ORG_ROLES_KEY, roles);
