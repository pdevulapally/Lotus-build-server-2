import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VerifiedIdentity } from '../auth/token-verifier.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async provisionFromIdentity(identity: VerifiedIdentity): Promise<User> {
    return this.prisma.user.upsert({
      where: { externalId: identity.externalId },
      update: { email: identity.email, name: identity.name },
      create: {
        externalId: identity.externalId,
        email: identity.email,
        name: identity.name,
      },
    });
  }

  async getById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
