import { validateEnv } from './env.validation';

const serviceAccount = JSON.stringify({
  project_id: 'test-project',
  client_email: 'firebase-adminsdk@test-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
});

const validConfig = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccount,
  CORS_ORIGINS: 'http://localhost:5173,https://app.example.com',
  RATE_LIMIT_TTL_SECONDS: '60',
  RATE_LIMIT_MAX: '100',
  ANTHROPIC_API_KEY: 'test-key',
  ANTHROPIC_MODEL: 'claude-sonnet-4-5',
  E2B_API_KEY: 'e2b-test-key',
  E2B_SANDBOX_TIMEOUT_SECONDS: '3600',
  AGENT_MAX_ITERATIONS: '50',
  AGENT_TOOL_TIMEOUT_SECONDS: '120',
  REDIS_URL: 'redis://:secret@localhost:6379',
  AGENT_QUEUE_CONCURRENCY: '5',
  MEMBERSHIP_CACHE_TTL_SECONDS: '30',
  ENABLE_API_DOCS: 'false',
};

describe('validateEnv', () => {
  it('parses a fully specified configuration', () => {
    const env = validateEnv(validConfig);
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://app.example.com',
    ]);
    expect(env.FIREBASE_SERVICE_ACCOUNT_JSON.project_id).toBe('test-project');
    expect(env.E2B_SANDBOX_TIMEOUT_SECONDS).toBe(3600);
  });

  it('rejects a configuration with a missing variable', () => {
    const partial: Record<string, unknown> = { ...validConfig };
    delete partial['DATABASE_URL'];
    expect(() => validateEnv(partial)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-redis REDIS_URL', () => {
    expect(() =>
      validateEnv({ ...validConfig, REDIS_URL: 'http://localhost:6379' }),
    ).toThrow(/REDIS_URL/);
  });

  it('rejects a missing REDIS_URL', () => {
    const partial: Record<string, unknown> = { ...validConfig };
    delete partial['REDIS_URL'];
    expect(() => validateEnv(partial)).toThrow(/REDIS_URL/);
  });

  it('rejects a missing E2B API key', () => {
    const partial: Record<string, unknown> = { ...validConfig };
    delete partial['E2B_API_KEY'];
    expect(() => validateEnv(partial)).toThrow(/E2B_API_KEY/);
  });

  it('rejects a service account that is not valid JSON', () => {
    expect(() =>
      validateEnv({ ...validConfig, FIREBASE_SERVICE_ACCOUNT_JSON: '{oops' }),
    ).toThrow(/FIREBASE_SERVICE_ACCOUNT_JSON/);
  });

  it('rejects a service account missing required fields', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          project_id: 'test-project',
        }),
      }),
    ).toThrow(/FIREBASE_SERVICE_ACCOUNT_JSON/);
  });

  it('rejects a sandbox timeout below the minimum', () => {
    expect(() =>
      validateEnv({ ...validConfig, E2B_SANDBOX_TIMEOUT_SECONDS: '5' }),
    ).toThrow(/E2B_SANDBOX_TIMEOUT_SECONDS/);
  });

  it('rejects non-numeric ports', () => {
    expect(() => validateEnv({ ...validConfig, PORT: 'abc' })).toThrow(/PORT/);
  });
});
