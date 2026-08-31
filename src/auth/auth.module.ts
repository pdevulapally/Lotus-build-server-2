import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OrgMembershipGuard } from './org-membership.guard';
import { MembershipCacheService } from './membership-cache.service';
import { TokenVerifierService } from './token-verifier.service';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [UsersModule],
  providers: [
    TokenVerifierService,
    OrgMembershipGuard,
    MembershipCacheService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenVerifierService, OrgMembershipGuard, MembershipCacheService],
})
export class AuthModule {}
