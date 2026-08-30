import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().url(),
  AUTH_JWKS_URL: z.string().url(),
  AUTH_ISSUER: z.string().url(),
  AUTH_AUDIENCE: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.string().url()).min(1)),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1),
  AGENT_WORKSPACE_ROOT: z
    .string()
    .min(1)
    .refine((p) => p.startsWith('/'), {
      message: 'must be an absolute path',
    }),
  AGENT_MAX_ITERATIONS: z.coerce.number().int().min(1).max(200),
  AGENT_TOOL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(600),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}
