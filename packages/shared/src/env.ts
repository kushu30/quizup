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
  GEMINI_API_KEY: optionalSecretSchema,
  OPENAI_API_KEY: optionalSecretSchema,
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const webEnvSchema = z.object({
  VITE_SERVER_URL: z.string().url(),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
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
