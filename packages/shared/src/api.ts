import { z } from 'zod';
import { difficultySchema, quizModeSchema } from './enums.js';
import { QUESTION_OPTION_COUNT, questionSchema, quizSchema } from './tables.js';

export const MAX_QUESTION_BANK_LIMIT = 500;
export const DEFAULT_QUESTION_BANK_LIMIT = 200;
export const MAX_CSV_IMPORT_ROWS = 500;
export const MAX_CSV_CHARACTERS = 500_000;

const uuidSchema = z.string().uuid();

export const quizFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  mode: quizModeSchema,
  settings: z.record(z.string(), z.unknown()),
});

export const quizCreateSchema = quizFieldsSchema.extend({
  mode: quizModeSchema.default('live'),
  settings: z.record(z.string(), z.unknown()).default({}),
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

const questionFieldsSchema = z.object({
  topic: z.string().trim().min(1, 'Topic is required').max(80),
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
});

function optionsAreDistinct(options: string[] | undefined): boolean {
  if (!options) {
    return true;
  }
  const normalized = options.map((option) => option.trim().toLowerCase());
  return new Set(normalized).size === normalized.length;
}

const DISTINCT_OPTIONS_MESSAGE = 'Options must be different from each other';

export const questionInputSchema = questionFieldsSchema.refine(
  (fields) => optionsAreDistinct(fields.options),
  { message: DISTINCT_OPTIONS_MESSAGE, path: ['options'] },
);
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionUpdateSchema = questionFieldsSchema
  .partial()
  .refine((fields) => Object.keys(fields).length > 0, 'Nothing to update')
  .refine((fields) => optionsAreDistinct(fields.options), {
    message: DISTINCT_OPTIONS_MESSAGE,
    path: ['options'],
  });
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;

export const questionListSchema = z.array(questionSchema);
export const topicListSchema = z.array(z.string());

export const questionBankQuerySchema = z.object({
  quizId: uuidSchema.optional(),
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
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
