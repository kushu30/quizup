import { z } from 'zod';
import { brandingSchema } from './branding.js';
import { poolRulesSchema } from './delivery.js';

export const DEFAULT_MAX_ADAPTIVE_ROUNDS = 10;
export const MIN_ADAPTIVE_ROUNDS = 1;
export const MAX_ADAPTIVE_ROUNDS = 50;

export const EXAM_MIN_DURATION_MINUTES = 1;
export const EXAM_MAX_DURATION_MINUTES = 300;
export const DEFAULT_EXAM_DURATION_MINUTES = 30;

export const accessModeSchema = z.enum(['open', 'token']);
export type AccessMode = z.infer<typeof accessModeSchema>;

export const quizModeSettingSchema = z.enum(['live', 'exam']);
export type QuizModeSetting = z.infer<typeof quizModeSettingSchema>;

const quizSettingsBaseSchema = z.object({
  mode: quizModeSettingSchema.default('live'),
  durationMinutes: z
    .number()
    .int()
    .min(EXAM_MIN_DURATION_MINUTES)
    .max(EXAM_MAX_DURATION_MINUTES)
    .optional(),
  adaptive: z.boolean().default(false),
  accessMode: accessModeSchema.default('open'),
  adaptiveRounds: z.number().int().min(MIN_ADAPTIVE_ROUNDS).max(MAX_ADAPTIVE_ROUNDS).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  pools: poolRulesSchema.default([]),
  showCorrectAnswers: z.boolean().optional(),
  branding: brandingSchema.optional(),
});

export const quizSettingsSchema = quizSettingsBaseSchema
  .superRefine((settings, context) => {
    if (settings.mode === 'exam' && settings.durationMinutes === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationMinutes'],
        message: 'An exam needs a duration in minutes',
      });
    }
  })
  .transform((settings) => {
    if (settings.mode === 'exam') {
      return {
        ...settings,
        adaptive: false,
        adaptiveRounds: undefined,
        shuffleQuestions: settings.shuffleQuestions ?? true,
        shuffleOptions: settings.shuffleOptions ?? true,
        showCorrectAnswers: settings.showCorrectAnswers ?? false,
      };
    }
    if (settings.adaptive) {
      return {
        ...settings,
        durationMinutes: undefined,
        shuffleQuestions: false,
        shuffleOptions: false,
        pools: [],
        showCorrectAnswers: settings.showCorrectAnswers ?? true,
      };
    }
    return {
      ...settings,
      durationMinutes: undefined,
      shuffleQuestions: settings.shuffleQuestions ?? false,
      shuffleOptions: false,
      showCorrectAnswers: settings.showCorrectAnswers ?? true,
    };
  });
export type QuizSettings = z.output<typeof quizSettingsSchema>;
export type QuizSettingsInput = z.input<typeof quizSettingsSchema>;

export function resolveAdaptiveRounds(
  requestedRounds: number | undefined,
  approvedQuestionCount: number,
): number {
  return Math.min(requestedRounds ?? DEFAULT_MAX_ADAPTIVE_ROUNDS, approvedQuestionCount);
}
