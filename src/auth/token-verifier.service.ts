import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseService } from '../firebase/firebase.service';

export interface VerifiedIdentity {
  externalId: string;
  email: string;
  name: string | null;
}

const PASSWORD_PROVIDER = 'password';

@Injectable()
export class TokenVerifierService {
  constructor(private readonly firebase: FirebaseService) {}

  async verify(token: string): Promise<VerifiedIdentity> {
    let decoded: DecodedIdToken;
    try {
      decoded = await this.firebase.auth.verifyIdToken(token, true);
    } catch {
      throw new UnauthorizedException('Invalid, expired, or revoked ID token');
    }

    const email = decoded.email;
    if (typeof email !== 'string' || email.length === 0) {
      throw new UnauthorizedException('Token is missing an email claim');
    }
    if (
      decoded.firebase.sign_in_provider === PASSWORD_PROVIDER &&
      decoded.email_verified !== true
    ) {
      throw new UnauthorizedException('Email address is not verified');
    }

    const name = decoded['name'];
    return {
      externalId: decoded.uid,
      email,
      name: typeof name === 'string' && name.length > 0 ? name : null,
    };
  }
}
