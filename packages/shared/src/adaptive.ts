import { z } from 'zod';

export const DEFAULT_MAX_ADAPTIVE_ROUNDS = 10;
export const MIN_ADAPTIVE_ROUNDS = 1;
export const MAX_ADAPTIVE_ROUNDS = 50;

export const quizSettingsSchema = z.object({
  adaptive: z.boolean().default(false),
  adaptiveRounds: z.number().int().min(MIN_ADAPTIVE_ROUNDS).max(MAX_ADAPTIVE_ROUNDS).optional(),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;
export type QuizSettingsInput = z.input<typeof quizSettingsSchema>;

export function resolveAdaptiveRounds(
  requestedRounds: number | undefined,
  approvedQuestionCount: number,
): number {
  return Math.min(requestedRounds ?? DEFAULT_MAX_ADAPTIVE_ROUNDS, approvedQuestionCount);
}
