import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { Env } from '../config/env.validation';

export interface VerifiedIdentity {
  externalId: string;
  email: string;
  name: string | null;
}

@Injectable()
export class TokenVerifierService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(configService: ConfigService<Env, true>) {
    this.jwks = createRemoteJWKSet(
      new URL(configService.get('AUTH_JWKS_URL', { infer: true })),
    );
    this.issuer = configService.get('AUTH_ISSUER', { infer: true });
    this.audience = configService.get('AUTH_AUDIENCE', { infer: true });
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      payload = result.payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const externalId = payload.sub;
    const email = payload['email'];
    const name = payload['name'];
    if (typeof externalId !== 'string' || externalId.length === 0) {
      throw new UnauthorizedException('Token is missing a subject claim');
    }
    if (typeof email !== 'string' || email.length === 0) {
      throw new UnauthorizedException('Token is missing an email claim');
    }
    return {
      externalId,
      email,
      name: typeof name === 'string' && name.length > 0 ? name : null,
    };
  }
}
