import { Request } from 'express';
import { MembershipRole } from '@prisma/client';

export interface RequestUser {
  id: string;
  externalId: string;
  email: string;
}

/** The authenticated user acting within a specific organization. */
export interface OrgActor {
  userId: string;
  role: MembershipRole;
}

export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
  orgActor?: OrgActor;
}
