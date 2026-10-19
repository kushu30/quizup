import { z } from 'zod';
import { QUESTION_OPTION_COUNT } from './tables.js';
import { sessionStatusSchema } from './enums.js';

export const roomJoinPayloadSchema = z.object({
  joinCode: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(40),
});
export type RoomJoinPayload = z.infer<typeof roomJoinPayloadSchema>;

export const answerSubmitPayloadSchema = z.object({
  questionId: z.string().uuid(),
  chosenIndex: z
    .number()
    .int()
    .min(0)
    .max(QUESTION_OPTION_COUNT - 1),
});
export type AnswerSubmitPayload = z.infer<typeof answerSubmitPayloadSchema>;

export const timePingPayloadSchema = z.object({
  clientSentMs: z.number(),
});
export type TimePingPayload = z.infer<typeof timePingPayloadSchema>;

export const proctorEventPayloadSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  simulated: z.boolean(),
});
export type ProctorEventPayload = z.infer<typeof proctorEventPayloadSchema>;

export const roomStatePayloadSchema = z.object({
  sessionId: z.string().uuid(),
  status: sessionStatusSchema,
  participantCount: z.number().int().nonnegative(),
});
export type RoomStatePayload = z.infer<typeof roomStatePayloadSchema>;

export const questionShowPayloadSchema = z.object({
  questionId: z.string().uuid(),
  stem: z.string(),
  options: z.array(z.string()).length(QUESTION_OPTION_COUNT),
  startsAtServerMs: z.number(),
  durationMs: z.number().int().positive(),
});
export type QuestionShowPayload = z.infer<typeof questionShowPayloadSchema>;

export const questionResultPayloadSchema = z.object({
  questionId: z.string().uuid(),
  correctIndex: z
    .number()
    .int()
    .min(0)
    .max(QUESTION_OPTION_COUNT - 1),
  yourChosenIndex: z
    .number()
    .int()
    .min(0)
    .max(QUESTION_OPTION_COUNT - 1)
    .nullable(),
  correct: z.boolean(),
  pointsAwarded: z.number().int().nonnegative(),
});
export type QuestionResultPayload = z.infer<typeof questionResultPayloadSchema>;

export const leaderboardEntrySchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  score: z.number(),
  rank: z.number().int().positive(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardUpdatePayloadSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
});
export type LeaderboardUpdatePayload = z.infer<typeof leaderboardUpdatePayloadSchema>;

export const sessionEndPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  endedAtServerMs: z.number(),
});
export type SessionEndPayload = z.infer<typeof sessionEndPayloadSchema>;

export const timePongPayloadSchema = z.object({
  clientSentMs: z.number(),
  serverMs: z.number(),
});
export type TimePongPayload = z.infer<typeof timePongPayloadSchema>;

export interface ClientToServerEvents {
  'room:join': (payload: RoomJoinPayload) => void;
  'answer:submit': (payload: AnswerSubmitPayload) => void;
  'time:ping': (payload: TimePingPayload) => void;
  'proctor:event': (payload: ProctorEventPayload) => void;
}

export interface ServerToClientEvents {
  'room:state': (payload: RoomStatePayload) => void;
  'question:show': (payload: QuestionShowPayload) => void;
  'question:result': (payload: QuestionResultPayload) => void;
  'leaderboard:update': (payload: LeaderboardUpdatePayload) => void;
  'session:end': (payload: SessionEndPayload) => void;
  'time:pong': (payload: TimePongPayload) => void;
}
