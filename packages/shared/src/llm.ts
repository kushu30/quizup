import { z } from 'zod';
import { difficultySchema } from './enums.js';
import { QUESTION_OPTION_COUNT } from './tables.js';

export const GENERATION_TOPIC_MAX_LENGTH = 60;
export const GENERATION_PASSAGE_MAX_LENGTH = 8000;
export const GENERATION_MIN_COUNT = 1;
export const GENERATION_MAX_COUNT = 20;
export const GENERATED_STEM_MAX_LENGTH = 500;
export const GENERATED_OPTION_MAX_LENGTH = 200;
export const MAX_BULK_APPROVE_IDS = 500;

export const generateQuestionsRequestSchema = z
  .object({
    topic: z
      .string()
      .trim()
      .min(1, 'Topic is required')
      .max(
        GENERATION_TOPIC_MAX_LENGTH,
        `Topic is at most ${GENERATION_TOPIC_MAX_LENGTH} characters`,
      ),
    passage: z
      .string()
      .max(
        GENERATION_PASSAGE_MAX_LENGTH,
        `Passage is at most ${GENERATION_PASSAGE_MAX_LENGTH} characters`,
      )
      .optional()
      .transform((value) =>
        value === undefined || value.trim() === '' ? undefined : value.trim(),
      ),
    count: z
      .number()
      .int()
      .min(GENERATION_MIN_COUNT)
      .max(GENERATION_MAX_COUNT, `Generate at most ${GENERATION_MAX_COUNT} questions at a time`),
    difficulty: difficultySchema,
  })
  .strict();
export type GenerateQuestionsRequest = z.infer<typeof generateQuestionsRequestSchema>;
export type GenerateQuestionsInput = z.input<typeof generateQuestionsRequestSchema>;

export const generatedQuestionSchema = z
  .object({
    stem: z.string().trim().min(1).max(GENERATED_STEM_MAX_LENGTH),
    options: z
      .array(z.string().trim().min(1).max(GENERATED_OPTION_MAX_LENGTH))
      .length(QUESTION_OPTION_COUNT),
    correct_index: z
      .number()
      .int()
      .min(0)
      .max(QUESTION_OPTION_COUNT - 1),
    difficulty: difficultySchema,
    topic: z.string().trim().min(1),
  })
  .strict()
  .refine(
    (question) =>
      new Set(question.options.map((option) => option.toLowerCase())).size ===
      question.options.length,
    { message: 'Options must be distinct ignoring case', path: ['options'] },
  );
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export function createGeneratedQuestionsSchema(count: number) {
  return z.array(generatedQuestionSchema).length(count);
}

export const approveQuestionsBodySchema = z
  .object({
    questionIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_APPROVE_IDS),
  })
  .strict();
export type ApproveQuestionsBody = z.infer<typeof approveQuestionsBodySchema>;

export const approveQuestionsResultSchema = z.object({
  approved: z.number().int().nonnegative(),
});
export type ApproveQuestionsResult = z.infer<typeof approveQuestionsResultSchema>;
