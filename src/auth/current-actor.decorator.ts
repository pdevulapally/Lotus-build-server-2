import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedRequest, OrgActor } from './auth.types';

/**
 * Resolves the authenticated user together with their membership role in the
 * organization targeted by the request. Requires OrgMembershipGuard.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrgActor => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.orgActor) {
      throw new ForbiddenException('Organization membership not resolved');
    }
    return request.orgActor;
  },
);
