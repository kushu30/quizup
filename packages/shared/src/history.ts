import { z } from 'zod';
import { brandingSchema, splitStoredBranding } from './branding.js';
import { summarizeFeedback } from './feedback.js';
import { sessionStatusSchema } from './enums.js';
import type { Session } from './tables.js';

export const quizSessionHistoryRowSchema = z.object({
  sessionId: z.string().uuid(),
  joinCode: z.string(),
  status: sessionStatusSchema,
  mode: z.enum(['live', 'exam']),
  adaptive: z.boolean(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  participantCount: z.number().int().nonnegative(),
  averageScore: z.number().nullable(),
  feedbackCount: z.number().int().nonnegative(),
  averageRating: z.number().nullable(),
});
export type QuizSessionHistoryRow = z.infer<typeof quizSessionHistoryRowSchema>;
export const quizSessionHistorySchema = z.array(quizSessionHistoryRowSchema);

export const myResultRowSchema = z.object({
  sessionId: z.string().uuid(),
  quizTitle: z.string(),
  branding: brandingSchema.nullable(),
  mode: z.enum(['live', 'exam']),
  adaptive: z.boolean(),
  endedAt: z.string().nullable(),
  score: z.number().nullable(),
  rank: z.number().int().positive().nullable(),
  participantCount: z.number().int().nonnegative(),
  resultsHidden: z.boolean(),
});
export type MyResultRow = z.infer<typeof myResultRowSchema>;
export const myResultsSchema = z.array(myResultRowSchema);

const storedSummarySchema = z.object({
  adaptive: z.boolean().optional(),
  participants: z.array(z.object({ participantId: z.string(), score: z.number() })).optional(),
  leaderboard: z
    .array(z.object({ participantId: z.string(), score: z.number(), rank: z.number().int() }))
    .optional(),
});

function readSummary(summary: unknown) {
  const parsed = storedSummarySchema.safeParse(summary);
  return parsed.success ? parsed.data : null;
}

function modeOf(session: Session): 'live' | 'exam' {
  return session.exam_duration_minutes === null ? 'live' : 'exam';
}

export function historyRowFromSession(input: {
  session: Session;
  participantCount: number;
  summary: unknown;
  ratings: number[];
}): QuizSessionHistoryRow {
  const summary = readSummary(input.summary);
  const scores = summary?.participants?.map((participant) => participant.score) ?? [];
  const feedback = summarizeFeedback(input.ratings.map((rating) => ({ rating })));
  return {
    sessionId: input.session.id,
    joinCode: input.session.join_code,
    status: input.session.status,
    mode: modeOf(input.session),
    adaptive: summary?.adaptive ?? false,
    startedAt: input.session.started_at,
    endedAt: input.session.ended_at,
    participantCount: input.participantCount,
    averageScore:
      scores.length > 0
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : null,
    feedbackCount: feedback.count,
    averageRating: feedback.averageRating,
  };
}

export function myResultFromSession(input: {
  session: Session;
  quizTitle: string;
  quizSettings: unknown;
  participantId: string;
  participantCount: number;
  summary: unknown;
}): MyResultRow {
  const summary = readSummary(input.summary);
  const mode = modeOf(input.session);
  const resultsHidden = mode === 'exam' && input.session.results_released_at === null;
  const entry = summary?.leaderboard?.find((row) => row.participantId === input.participantId);
  return {
    sessionId: input.session.id,
    quizTitle: input.quizTitle,
    branding: splitStoredBranding(input.quizSettings).branding,
    mode,
    adaptive: summary?.adaptive ?? false,
    endedAt: input.session.ended_at,
    score: resultsHidden ? null : (entry?.score ?? null),
    rank: resultsHidden ? null : (entry?.rank ?? null),
    participantCount: input.participantCount,
    resultsHidden,
  };
}

export const quizActivitySchema = z.object({
  quizId: z.string().uuid(),
  sessionCount: z.number().int().nonnegative(),
  latest: z.object({
    sessionId: z.string().uuid(),
    joinCode: z.string(),
    status: sessionStatusSchema,
    startedAt: z.string().nullable(),
    endedAt: z.string().nullable(),
  }),
});
export type QuizActivity = z.infer<typeof quizActivitySchema>;
export const quizActivityListSchema = z.array(quizActivitySchema);

function startedAtOrFuture(session: Session): number {
  return session.started_at ? Date.parse(session.started_at) : Number.POSITIVE_INFINITY;
}

export function quizActivityFromSessions(sessions: Session[]): QuizActivity[] {
  const byQuiz = new Map<string, Session[]>();
  for (const session of sessions) {
    byQuiz.set(session.quiz_id, [...(byQuiz.get(session.quiz_id) ?? []), session]);
  }
  return [...byQuiz.entries()].map(([quizId, quizSessions]) => {
    const latest = [...quizSessions].sort(
      (first, second) => startedAtOrFuture(second) - startedAtOrFuture(first),
    )[0] as Session;
    return {
      quizId,
      sessionCount: quizSessions.length,
      latest: {
        sessionId: latest.id,
        joinCode: latest.join_code,
        status: latest.status,
        startedAt: latest.started_at,
        endedAt: latest.ended_at,
      },
    };
  });
}
