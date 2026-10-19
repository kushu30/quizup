import { parseEnvOrThrow, serverEnvSchema } from '@quizup/shared';

export const serverEnv = parseEnvOrThrow(serverEnvSchema, process.env, 'server');
