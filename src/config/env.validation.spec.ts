import { validateEnv } from './env.validation';

const validConfig = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_JWKS_URL: 'https://issuer.example.com/.well-known/jwks.json',
  AUTH_ISSUER: 'https://issuer.example.com/',
  AUTH_AUDIENCE: 'https://api.example.com',
  CORS_ORIGINS: 'http://localhost:5173,https://app.example.com',
  RATE_LIMIT_TTL_SECONDS: '60',
  RATE_LIMIT_MAX: '100',
};

describe('validateEnv', () => {
  it('parses a fully specified configuration', () => {
    const env = validateEnv(validConfig);
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://app.example.com',
    ]);
  });

  it('rejects a configuration with a missing variable', () => {
    const partial: Record<string, unknown> = { ...validConfig };
    delete partial['DATABASE_URL'];
    expect(() => validateEnv(partial)).toThrow(/DATABASE_URL/);
  });

  it('rejects invalid URLs', () => {
    expect(() =>
      validateEnv({ ...validConfig, AUTH_JWKS_URL: 'not-a-url' }),
    ).toThrow(/AUTH_JWKS_URL/);
  });

  it('rejects non-numeric ports', () => {
    expect(() => validateEnv({ ...validConfig, PORT: 'abc' })).toThrow(/PORT/);
  });
});
