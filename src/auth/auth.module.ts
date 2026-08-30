import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OrgMembershipGuard } from './org-membership.guard';
import { TokenVerifierService } from './token-verifier.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [
    TokenVerifierService,
    OrgMembershipGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenVerifierService, OrgMembershipGuard],
})
export class AuthModule {}
