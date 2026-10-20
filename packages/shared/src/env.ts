import { z } from 'zod';

const optionalSecretSchema = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value));

export const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.string().url()).min(1)),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LLM_PROVIDER: z.enum(['gemini']).default('gemini'),
  GEMINI_API_KEY: optionalSecretSchema,
  GEMINI_MODEL: optionalSecretSchema,
  OPENAI_API_KEY: optionalSecretSchema,
  APP_URL: optionalSecretSchema.pipe(z.string().url().optional()),
  BREVO_API_KEY: optionalSecretSchema,
  SMTP_HOST: optionalSecretSchema,
  SMTP_PORT: optionalSecretSchema
    .transform((value) => (value === undefined ? 587 : Number(value)))
    .pipe(z.number().int().min(1).max(65535)),
  SMTP_USER: optionalSecretSchema,
  SMTP_PASSWORD: optionalSecretSchema,
  MAIL_FROM: optionalSecretSchema.pipe(z.string().email().optional()),
  MAIL_FROM_NAME: optionalSecretSchema,
  MAIL_REPLY_TO: optionalSecretSchema.pipe(z.string().email().optional()),
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function isMailConfigured(env: ServerEnv): boolean {
  const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
  return Boolean(env.MAIL_FROM && (env.BREVO_API_KEY || hasSmtp));
}

export const llmEnvSchema = serverEnvSchema.pick({
  LLM_PROVIDER: true,
  GEMINI_API_KEY: true,
  GEMINI_MODEL: true,
});
export type LlmEnv = z.infer<typeof llmEnvSchema>;

export const webEnvSchema = z.object({
  VITE_SERVER_URL: z.string().url(),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_GOOGLE_AUTH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type WebEnv = z.infer<typeof webEnvSchema>;

export function parseEnvOrThrow<Schema extends z.ZodTypeAny>(
  schema: Schema,
  rawEnv: Record<string, unknown>,
  label: string,
): z.infer<Schema> {
  const result = schema.safeParse(rawEnv);
  if (result.success) {
    return result.data;
  }
  const problems = result.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid ${label} environment:\n${problems}`);
}
