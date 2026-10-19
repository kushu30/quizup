import { z } from 'zod';
import { sessionSchema } from './tables.js';

export const MIN_QUESTION_DURATION_SECONDS = 5;
export const MAX_QUESTION_DURATION_SECONDS = 120;
export const DEFAULT_QUESTION_DURATION_SECONDS = 20;

export const sessionCreateSchema = z.object({
  quizId: z.string().uuid(),
  questionDurationSeconds: z
    .number()
    .int()
    .min(MIN_QUESTION_DURATION_SECONDS)
    .max(MAX_QUESTION_DURATION_SECONDS)
    .default(DEFAULT_QUESTION_DURATION_SECONDS),
});
export type SessionCreateInput = z.input<typeof sessionCreateSchema>;

export const sessionIdParamsSchema = z.object({ sessionId: z.string().uuid() });

export const sessionSummarySchema = z.object({
  session: sessionSchema,
  joinCode: z.string(),
  questionDurationSeconds: z.number().int().positive().nullable(),
  questionCount: z.number().int().nonnegative(),
  currentQuestionNumber: z.number().int().positive().nullable(),
  participantCount: z.number().int().nonnegative(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
