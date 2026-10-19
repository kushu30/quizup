import { parseEnvOrThrow, webEnvSchema } from '@quizup/shared';

export const webEnv = parseEnvOrThrow(webEnvSchema, import.meta.env, 'web');
