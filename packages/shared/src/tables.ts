import { z } from 'zod';
import {
  difficultySchema,
  questionSourceSchema,
  quizModeSchema,
  sessionStatusSchema,
  userRoleSchema,
} from './enums.js';

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const jsonObjectSchema = z.record(z.string(), z.unknown());

export const JOIN_CODE_LENGTH = 6;
export const QUESTION_OPTION_COUNT = 4;

export const profileSchema = z.object({
  id: uuidSchema,
  role: userRoleSchema,
  name: z.string().nullable(),
  email: z.string().email().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const quizSchema = z.object({
  id: uuidSchema,
  host_id: uuidSchema,
  title: z.string().min(1),
  mode: quizModeSchema,
  settings: jsonObjectSchema,
  created_at: timestampSchema,
});
export type Quiz = z.infer<typeof quizSchema>;

export const questionOptionsSchema = z.array(z.string().min(1)).length(QUESTION_OPTION_COUNT);

export const questionSchema = z.object({
  id: uuidSchema,
  quiz_id: uuidSchema,
  topic: z.string().min(1),
  stem: z.string().min(1),
  options: questionOptionsSchema,
  correct_index: z
    .number()
    .int()
    .min(0)
    .max(QUESTION_OPTION_COUNT - 1),
  difficulty: difficultySchema,
  elo_rating: z.number(),
  source: questionSourceSchema,
  approved: z.boolean(),
});
export type Question = z.infer<typeof questionSchema>;

export const sessionSchema = z.object({
  id: uuidSchema,
  quiz_id: uuidSchema,
  join_code: z.string().length(JOIN_CODE_LENGTH),
  status: sessionStatusSchema,
  started_at: timestampSchema.nullable(),
  ended_at: timestampSchema.nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

export const participantSchema = z.object({
  id: uuidSchema,
  session_id: uuidSchema,
  user_id: uuidSchema.nullable(),
  display_name: z.string().min(1),
  elo: z.number(),
  joined_at: timestampSchema,
});
export type Participant = z.infer<typeof participantSchema>;

export const responseSchema = z.object({
  id: uuidSchema,
  session_id: uuidSchema,
  participant_id: uuidSchema,
  question_id: uuidSchema,
  chosen_index: z
    .number()
    .int()
    .min(0)
    .max(QUESTION_OPTION_COUNT - 1),
  correct: z.boolean(),
  response_ms: z.number().int().nonnegative(),
  served_at: timestampSchema,
  answered_at: timestampSchema,
});
export type Response = z.infer<typeof responseSchema>;

export const knowledgeStateSchema = z.object({
  participant_id: uuidSchema,
  topic: z.string().min(1),
  p_mastery: z.number().min(0).max(1),
  updated_at: timestampSchema,
});
export type KnowledgeState = z.infer<typeof knowledgeStateSchema>;

export const proctorEventSchema = z.object({
  id: uuidSchema,
  session_id: uuidSchema,
  participant_id: uuidSchema,
  type: z.string().min(1),
  payload: jsonObjectSchema,
  at: timestampSchema,
  simulated: z.boolean(),
});
export type ProctorEvent = z.infer<typeof proctorEventSchema>;

export const riskReportSchema = z.object({
  session_id: uuidSchema,
  participant_id: uuidSchema,
  score: z.number().min(0).max(1),
  flags: jsonObjectSchema,
  reviewed: z.boolean(),
  reviewer_note: z.string().nullable(),
});
export type RiskReport = z.infer<typeof riskReportSchema>;

export const codingProblemSchema = z.object({
  id: uuidSchema,
  quiz_id: uuidSchema,
  title: z.string().min(1),
  statement_md: z.string(),
  languages: z.array(z.string().min(1)),
  time_limit_ms: z.number().int().positive(),
  memory_limit_mb: z.number().int().positive(),
});
export type CodingProblem = z.infer<typeof codingProblemSchema>;

export const testCaseSchema = z.object({
  id: uuidSchema,
  problem_id: uuidSchema,
  input: z.string(),
  expected_output: z.string(),
  hidden: z.boolean(),
  weight: z.number().nonnegative(),
});
export type TestCase = z.infer<typeof testCaseSchema>;

export const submissionSchema = z.object({
  id: uuidSchema,
  session_id: uuidSchema,
  participant_id: uuidSchema,
  problem_id: uuidSchema,
  language: z.string().min(1),
  source: z.string(),
  passed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  runtime_ms: z.number().int().nonnegative().nullable(),
  created_at: timestampSchema,
});
export type Submission = z.infer<typeof submissionSchema>;

export const joinFormSchema = z.object({
  joinCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(JOIN_CODE_LENGTH, `Join code is ${JOIN_CODE_LENGTH} characters`)
    .regex(/^[A-Z0-9]+$/, 'Join code uses letters and digits only'),
  displayName: z.string().trim().min(1, 'Enter a display name').max(40, 'Max 40 characters'),
});
export type JoinForm = z.infer<typeof joinFormSchema>;
