import { z } from 'zod';
import { deviceInfoSchema } from './deviceInfo.js';
import { difficultySchema, sessionStatusSchema, type Difficulty } from './enums.js';
import { proctorCountsSchema } from './exam.js';
import { leaderboardEntrySchema } from './socket.js';

export const HISTOGRAM_BUCKET_COUNT = 10;
export const MISMATCH_MIN_ANSWERS = 3;
export const EASY_MIN_ACCURACY = 0.4;
export const HARD_MAX_ACCURACY = 0.8;
export const ANALYTICS_THROTTLE_MS = 250;

export function emptyHistogram(): number[] {
  return new Array<number>(HISTOGRAM_BUCKET_COUNT).fill(0);
}

export function bucketIndex(responseMs: number, durationMs: number): number {
  if (!(durationMs > 0) || !(responseMs > 0)) {
    return 0;
  }
  return Math.min(
    Math.floor((responseMs * HISTOGRAM_BUCKET_COUNT) / durationMs),
    HISTOGRAM_BUCKET_COUNT - 1,
  );
}

export function incrementBucket(histogram: readonly number[], bucket: number): number[] {
  const next = [...histogram];
  next[bucket] = (next[bucket] ?? 0) + 1;
  return next;
}

export interface QuestionAggregate {
  answered: number;
  correct: number;
  histogram: number[];
}

export function emptyQuestionAggregate(): QuestionAggregate {
  return { answered: 0, correct: 0, histogram: emptyHistogram() };
}

export function applyQuestionResponse(
  aggregate: QuestionAggregate,
  response: { correct: boolean; bucket: number },
): QuestionAggregate {
  return {
    answered: aggregate.answered + 1,
    correct: aggregate.correct + (response.correct ? 1 : 0),
    histogram: incrementBucket(aggregate.histogram, response.bucket),
  };
}

export interface ParticipantAggregate {
  score: number;
  answered: number;
  correct: number;
  responseMsSum: number;
}

export function emptyParticipantAggregate(): ParticipantAggregate {
  return { score: 0, answered: 0, correct: 0, responseMsSum: 0 };
}

export function applyParticipantResponse(
  aggregate: ParticipantAggregate,
  response: { correct: boolean; points: number; responseMs: number },
): ParticipantAggregate {
  const score = aggregate.score + response.points;
  return {
    score,
    answered: aggregate.answered + 1,
    correct: aggregate.correct + (response.correct ? 1 : 0),
    responseMsSum: aggregate.responseMsSum + response.responseMs,
  };
}

export function observedAccuracy(answered: number, correct: number): number | null {
  return answered === 0 ? null : correct / answered;
}

export const mismatchSchema = z.enum(['harder_than_labeled', 'easier_than_labeled']);
export type DifficultyMismatch = z.infer<typeof mismatchSchema>;

export function difficultyMismatch(
  labeled: Difficulty,
  accuracy: number | null,
  answered: number,
): DifficultyMismatch | null {
  if (accuracy === null || answered < MISMATCH_MIN_ANSWERS) {
    return null;
  }
  if (labeled === 'easy' && accuracy < EASY_MIN_ACCURACY) {
    return 'harder_than_labeled';
  }
  if (labeled === 'hard' && accuracy > HARD_MAX_ACCURACY) {
    return 'easier_than_labeled';
  }
  return null;
}

export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

const histogramSchema = z.array(z.number().int().nonnegative()).length(HISTOGRAM_BUCKET_COUNT);

export const analyticsTopicSchema = z.object({ key: z.string(), label: z.string() });
export type AnalyticsTopic = z.infer<typeof analyticsTopicSchema>;

export const questionAnalyticsSchema = z.object({
  questionId: z.string().uuid(),
  stem: z.string(),
  topic: z.string(),
  labeledDifficulty: difficultySchema,
  round: z.number().int().positive(),
  answered: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1).nullable(),
  mismatch: mismatchSchema.nullable(),
  histogram: histogramSchema,
  medianResponseMs: z.number().nullable(),
  ratingAnswers: z.number().int().nonnegative().default(0),
  provisional: z.boolean().default(false),
});
export type QuestionAnalytics = z.infer<typeof questionAnalyticsSchema>;

export const participantAnalyticsSchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  rank: z.number().int().positive(),
  score: z.number(),
  answered: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  avgResponseMs: z.number().nullable(),
  rating: z.number().nullable(),
  proctorCounts: proctorCountsSchema.nullable(),
  devices: z.array(deviceInfoSchema).default([]),
  mastery: z.array(z.number().min(0).max(1).nullable()),
});
export type ParticipantAnalytics = z.infer<typeof participantAnalyticsSchema>;

export const analyticsSnapshotSchema = z.object({
  sessionId: z.string().uuid(),
  source: z.enum(['live', 'rebuilt']),
  mode: z.enum(['live', 'exam']).default('live'),
  status: sessionStatusSchema,
  generatedAtMs: z.number(),
  adaptive: z.boolean(),
  totalRounds: z.number().int().positive().nullable(),
  roundsCompleted: z.number().int().nonnegative(),
  currentRound: z.number().int().positive().nullable(),
  topics: z.array(analyticsTopicSchema),
  questions: z.array(questionAnalyticsSchema),
  sessionHistogram: histogramSchema,
  currentRoundHistogram: histogramSchema,
  participants: z.array(participantAnalyticsSchema),
  leaderboard: z.array(leaderboardEntrySchema),
});
export type AnalyticsSnapshot = z.infer<typeof analyticsSnapshotSchema>;

export const exportTypeSchema = z.enum(['participants', 'responses']);
export type ExportType = z.infer<typeof exportTypeSchema>;
export const exportQuerySchema = z.object({ type: exportTypeSchema });
