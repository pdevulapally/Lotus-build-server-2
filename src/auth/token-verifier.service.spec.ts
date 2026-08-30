import { UnauthorizedException } from '@nestjs/common';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseService } from '../firebase/firebase.service';
import { TokenVerifierService } from './token-verifier.service';

function decodedToken(overrides: Partial<DecodedIdToken>): DecodedIdToken {
  return {
    aud: 'test-project',
    auth_time: 0,
    exp: 0,
    firebase: {
      identities: {},
      sign_in_provider: 'google.com',
    },
    iat: 0,
    iss: 'https://securetoken.google.com/test-project',
    sub: 'uid-123',
    uid: 'uid-123',
    email: 'user@example.com',
    email_verified: true,
    ...overrides,
  } as DecodedIdToken;
}

describe('TokenVerifierService', () => {
  let verifyIdToken: jest.Mock;
  let service: TokenVerifierService;

  beforeEach(() => {
    verifyIdToken = jest.fn();
    const firebase = {
      auth: { verifyIdToken },
    } as unknown as FirebaseService;
    service = new TokenVerifierService(firebase);
  });

  it('accepts a valid Google sign-in token', async () => {
    verifyIdToken.mockResolvedValue(decodedToken({ name: 'Test User' }));
    await expect(service.verify('token')).resolves.toEqual({
      externalId: 'uid-123',
      email: 'user@example.com',
      name: 'Test User',
    });
    expect(verifyIdToken).toHaveBeenCalledWith('token', true);
  });

  it('accepts a verified email/password token', async () => {
    verifyIdToken.mockResolvedValue(
      decodedToken({
        firebase: { identities: {}, sign_in_provider: 'password' },
        email_verified: true,
      }),
    );
    const identity = await service.verify('token');
    expect(identity.externalId).toBe('uid-123');
    expect(identity.name).toBeNull();
  });

  it('rejects an unverified email/password token', async () => {
    verifyIdToken.mockResolvedValue(
      decodedToken({
        firebase: { identities: {}, sign_in_provider: 'password' },
        email_verified: false,
      }),
    );
    await expect(service.verify('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token the Admin SDK refuses (expired/revoked/invalid)', async () => {
    verifyIdToken.mockRejectedValue(new Error('token revoked'));
    await expect(service.verify('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token without an email claim', async () => {
    const token = decodedToken({});
    delete (token as Record<string, unknown>)['email'];
    verifyIdToken.mockResolvedValue(token);
    await expect(service.verify('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
