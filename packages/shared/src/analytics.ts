import { z } from 'zod';
import { difficultySchema, sessionStatusSchema, type Difficulty } from './enums.js';
import { proctorCountsSchema } from './exam.js';
import { leaderboardEntrySchema } from './socket.js';

export const HISTOGRAM_BUCKET_COUNT = 10;
export const MIN_PROJECTION_SAMPLE = 3;
export const MIN_CONFIDENT_SAMPLE = 6;
export const PROJECTION_MAX_POINTS_PER_ROUND = 1000;
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

export interface RegressionSums {
  n: number;
  sumX: number;
  sumY: number;
  sumXY: number;
  sumXX: number;
}

export function emptyRegressionSums(): RegressionSums {
  return { n: 0, sumX: 0, sumY: 0, sumXY: 0, sumXX: 0 };
}

export function addRegressionPoint(sums: RegressionSums, x: number, y: number): RegressionSums {
  return {
    n: sums.n + 1,
    sumX: sums.sumX + x,
    sumY: sums.sumY + y,
    sumXY: sums.sumXY + x * y,
    sumXX: sums.sumXX + x * x,
  };
}

export const projectionSchema = z.object({
  projected: z.number(),
  slope: z.number(),
  n: z.number().int().nonnegative(),
  lowConfidence: z.boolean(),
});
export type Projection = z.infer<typeof projectionSchema>;

export interface ProjectionInput {
  sums: RegressionSums;
  currentScore: number;
  totalRounds: number | null;
  roundsCompleted: number;
  adaptive: boolean;
}

export function projectScore(input: ProjectionInput): Projection | null {
  const { sums, currentScore, totalRounds, roundsCompleted, adaptive } = input;
  if (totalRounds === null || totalRounds <= 0 || sums.n < MIN_PROJECTION_SAMPLE) {
    return null;
  }

  const denominator = sums.n * sums.sumXX - sums.sumX * sums.sumX;
  const slope = denominator === 0 ? 0 : (sums.n * sums.sumXY - sums.sumX * sums.sumY) / denominator;
  const intercept = (sums.sumY - slope * sums.sumX) / sums.n;
  const predicted = intercept + slope * totalRounds;

  const remainingRounds = Math.max(totalRounds - roundsCompleted, 0);
  const upperBound = currentScore + remainingRounds * PROJECTION_MAX_POINTS_PER_ROUND;
  const projected = Math.min(Math.max(predicted, currentScore), upperBound);

  return {
    projected,
    slope,
    n: sums.n,
    lowConfidence: adaptive || sums.n < MIN_CONFIDENT_SAMPLE,
  };
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
  regression: RegressionSums;
}

export function emptyParticipantAggregate(): ParticipantAggregate {
  return { score: 0, answered: 0, correct: 0, responseMsSum: 0, regression: emptyRegressionSums() };
}

export function applyParticipantResponse(
  aggregate: ParticipantAggregate,
  response: { correct: boolean; points: number; responseMs: number; round: number },
): ParticipantAggregate {
  const score = aggregate.score + response.points;
  return {
    score,
    answered: aggregate.answered + 1,
    correct: aggregate.correct + (response.correct ? 1 : 0),
    responseMsSum: aggregate.responseMsSum + response.responseMs,
    regression: addRegressionPoint(aggregate.regression, response.round, score),
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
  projection: projectionSchema.nullable(),
  checkpointProjection: z.number().nullable(),
  proctorCounts: proctorCountsSchema.nullable(),
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
  checkpointRound: z.number().int().positive().nullable(),
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
