import { Request } from 'express';

export interface RequestUser {
  id: string;
  externalId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}
