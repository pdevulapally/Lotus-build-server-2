import { z } from 'zod';

const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().email(),
  private_key: z.string().min(1),
});

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().url(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z
    .string()
    .min(1)
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'must be valid JSON',
        });
        return z.NEVER;
      }
    })
    .pipe(serviceAccountSchema),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.string().url()).min(1)),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1),
  E2B_API_KEY: z.string().min(1),
  E2B_SANDBOX_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(86400),
  AGENT_MAX_ITERATIONS: z.coerce.number().int().min(1).max(200),
  AGENT_TOOL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(600),
});

export type Env = z.infer<typeof envSchema>;
export type FirebaseServiceAccount = z.infer<typeof serviceAccountSchema>;

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
