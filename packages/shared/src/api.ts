import { z } from 'zod';
import { quizSettingsSchema } from './adaptive.js';
import { difficultySchema, quizModeSchema } from './enums.js';
import { QUESTION_IMAGE_ALT_MAX, QUESTION_IMAGE_URL_MAX } from './questionImage.js';
import { QUESTION_OPTION_COUNT, questionSchema, quizSchema } from './tables.js';

export const MAX_QUESTION_BANK_LIMIT = 500;
export const DEFAULT_QUESTION_BANK_LIMIT = 200;
export const MAX_CSV_IMPORT_ROWS = 500;
export const MAX_CSV_CHARACTERS = 500_000;

const uuidSchema = z.string().uuid();

export const quizFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  mode: quizModeSchema,
  settings: quizSettingsSchema,
});

export const quizCreateSchema = quizFieldsSchema.extend({
  mode: quizModeSchema.default('live'),
  settings: quizSettingsSchema.default({}),
});
export type QuizCreateInput = z.input<typeof quizCreateSchema>;

export const quizUpdateSchema = quizFieldsSchema
  .partial()
  .refine((fields) => Object.keys(fields).length > 0, 'Nothing to update');
export type QuizUpdateInput = z.infer<typeof quizUpdateSchema>;

export const quizWithCountSchema = quizSchema.extend({
  question_count: z.number().int().nonnegative(),
});
export type QuizWithCount = z.infer<typeof quizWithCountSchema>;
export const quizWithCountListSchema = z.array(quizWithCountSchema);

export const DEFAULT_MODULE = 'Unsorted';

const moduleNameSchema = z.string().trim().min(1, 'Module name is required').max(80);

const questionFieldsSchema = z.object({
  stem: z.string().trim().min(1, 'Question text is required').max(1000),
  options: z
    .array(z.string().trim().min(1, 'Every option needs text').max(300))
    .length(QUESTION_OPTION_COUNT, `Exactly ${QUESTION_OPTION_COUNT} options`),
  correct_index: z
    .number()
    .int()
    .min(0)
    .max(QUESTION_OPTION_COUNT - 1),
  difficulty: difficultySchema,
  image_url: z
    .string()
    .url()
    .max(QUESTION_IMAGE_URL_MAX)
    .refine((value) => value.startsWith('https://'), 'The image address must use https')
    .nullable()
    .optional(),
  image_alt: z.string().trim().max(QUESTION_IMAGE_ALT_MAX).nullable().optional(),
});

const IMAGE_ALT_MESSAGE = 'Describe the image for students who cannot see it';

function imageHasDescription(fields: { image_url?: string | null; image_alt?: string | null }) {
  return !fields.image_url || Boolean(fields.image_alt?.trim());
}

function optionsAreDistinct(options: string[] | undefined): boolean {
  if (!options) {
    return true;
  }
  const normalized = options.map((option) => option.trim().toLowerCase());
  return new Set(normalized).size === normalized.length;
}

const DISTINCT_OPTIONS_MESSAGE = 'Options must be different from each other';

export const questionInputSchema = questionFieldsSchema
  .extend({
    topic: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((value) => value || DEFAULT_MODULE),
  })
  .refine((fields) => optionsAreDistinct(fields.options), {
    message: DISTINCT_OPTIONS_MESSAGE,
    path: ['options'],
  })
  .refine(imageHasDescription, { message: IMAGE_ALT_MESSAGE, path: ['image_alt'] });
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionUpdateSchema = questionFieldsSchema
  .partial()
  .extend({ topic: moduleNameSchema.optional() })
  .refine((fields) => Object.keys(fields).length > 0, 'Nothing to update')
  .refine((fields) => optionsAreDistinct(fields.options), {
    message: DISTINCT_OPTIONS_MESSAGE,
    path: ['options'],
  })
  .refine(imageHasDescription, { message: IMAGE_ALT_MESSAGE, path: ['image_alt'] });
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;

export const questionMoveSchema = z.object({
  questionIds: z.array(uuidSchema).min(1).max(MAX_QUESTION_BANK_LIMIT),
  topic: moduleNameSchema,
});
export const questionOrderSchema = z.object({
  questionIds: z
    .array(uuidSchema)
    .min(1)
    .max(MAX_QUESTION_BANK_LIMIT)
    .refine((ids) => new Set(ids).size === ids.length, 'Each question can be listed once'),
});
export type QuestionOrderInput = z.infer<typeof questionOrderSchema>;

export const questionMoveResultSchema = z.object({ moved: z.number().int().nonnegative() });
export type QuestionMoveResult = z.infer<typeof questionMoveResultSchema>;
export type QuestionMoveInput = z.infer<typeof questionMoveSchema>;

export const questionListSchema = z.array(questionSchema);
export const topicListSchema = z.array(z.string());

export const approvalFilterSchema = z.enum(['approved', 'pending']);
export type ApprovalFilter = z.infer<typeof approvalFilterSchema>;

export const questionBankQuerySchema = z.object({
  quizId: uuidSchema.optional(),
  approval: approvalFilterSchema.optional(),
  search: z.string().trim().max(100).optional(),
  topic: z.string().trim().max(80).optional(),
  difficulty: difficultySchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_QUESTION_BANK_LIMIT)
    .default(DEFAULT_QUESTION_BANK_LIMIT),
});
export type QuestionBankQuery = z.input<typeof questionBankQuerySchema>;

export const topicsQuerySchema = z.object({ quizId: uuidSchema.optional() });

export const quizIdParamsSchema = z.object({ quizId: uuidSchema });
export const questionIdParamsSchema = z.object({ questionId: uuidSchema });

export const csvImportBodySchema = z.object({
  csv: z.string().min(1, 'CSV is empty').max(MAX_CSV_CHARACTERS),
});
export type CsvImportBody = z.infer<typeof csvImportBodySchema>;

export const csvImportResultSchema = z.object({
  imported: z.number().int().nonnegative(),
});
export type CsvImportResult = z.infer<typeof csvImportResultSchema>;

export const rowErrorSchema = z.object({
  row: z.number().int().positive(),
  message: z.string(),
});
export type RowError = z.infer<typeof rowErrorSchema>;

export const apiErrorSchema = z.object({
  error: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  rowErrors: z.array(rowErrorSchema).optional(),
  message: z.string().optional(),
  summary: z.string().optional(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
