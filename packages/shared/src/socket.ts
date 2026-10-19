import { z } from 'zod';
import { DISPLAY_NAME_MAX_LENGTH, JOIN_CODE_LENGTH, QUESTION_OPTION_COUNT } from './tables.js';
import { difficultySchema, sessionStatusSchema } from './enums.js';

export const SOCKET_ERROR_CODES = [
  'invalid_payload',
  'rate_limited',
  'server_error',
  'unauthorized',
  'forbidden',
  'session_not_found',
  'session_ended',
  'session_started',
  'name_invalid',
  'name_taken',
  'invalid_rejoin_token',
  'not_in_room',
  'no_active_question',
  'wrong_question',
  'too_early',
  'too_late',
  'already_answered',
] as const;
export const socketErrorCodeSchema = z.enum(SOCKET_ERROR_CODES);
export type SocketErrorCode = z.infer<typeof socketErrorCodeSchema>;

export type Ack<Success extends object = object> =
  ({ ok: true } & Success) | { ok: false; error: SocketErrorCode };

const optionIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(QUESTION_OPTION_COUNT - 1);

export const studentJoinPayloadSchema = z
  .object({
    joinCode: z.string().trim().toUpperCase().length(JOIN_CODE_LENGTH),
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
    rejoinToken: z.string().max(128).optional(),
  })
  .strict();

export const hostJoinPayloadSchema = z.object({ sessionId: z.string().uuid() }).strict();

export const roomJoinPayloadSchema = z.union([hostJoinPayloadSchema, studentJoinPayloadSchema]);
export type RoomJoinPayload = z.input<typeof roomJoinPayloadSchema>;
export type StudentJoinPayload = z.output<typeof studentJoinPayloadSchema>;

export type RoomJoinAck = Ack<
  | { role: 'host'; sessionId: string }
  | { role: 'student'; sessionId: string; participantId: string; rejoinToken: string }
>;

export const answerSubmitPayloadSchema = z
  .object({
    questionId: z.string().uuid(),
    chosenIndex: optionIndexSchema,
  })
  .strict();
export type AnswerSubmitPayload = z.infer<typeof answerSubmitPayloadSchema>;
export type AnswerSubmitAck = Ack;

export const timePingPayloadSchema = z.object({ clientSentMs: z.number() }).strict();
export type TimePingPayload = z.infer<typeof timePingPayloadSchema>;
export type TimePingAck = Ack;

export const proctorEventPayloadSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  simulated: z.boolean(),
});
export type ProctorEventPayload = z.infer<typeof proctorEventPayloadSchema>;

export const participantPresenceSchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  connected: z.boolean(),
});
export type ParticipantPresence = z.infer<typeof participantPresenceSchema>;

export const questionShowPayloadSchema = z.object({
  questionId: z.string().uuid(),
  stem: z.string(),
  options: z.array(z.string()).length(QUESTION_OPTION_COUNT),
  startsAtServerMs: z.number(),
  durationMs: z.number().int().positive(),
});
export type QuestionShowPayload = z.infer<typeof questionShowPayloadSchema>;

export const yourQuestionResultSchema = z.object({
  chosenIndex: optionIndexSchema.nullable(),
  correct: z.boolean(),
  pointsAwarded: z.number().int().nonnegative(),
  totalPoints: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
});
export type YourQuestionResult = z.infer<typeof yourQuestionResultSchema>;

export const questionResultPayloadSchema = z.object({
  questionId: z.string().uuid(),
  correctIndex: optionIndexSchema,
  optionCounts: z.array(z.number().int().nonnegative()).length(QUESTION_OPTION_COUNT).nullable(),
  you: yourQuestionResultSchema.nullable(),
});
export type QuestionResultPayload = z.infer<typeof questionResultPayloadSchema>;

export const leaderboardEntrySchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  score: z.number(),
  rank: z.number().int().positive(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const yourStandingSchema = z.object({
  rank: z.number().int().positive(),
  score: z.number(),
});
export type YourStanding = z.infer<typeof yourStandingSchema>;

export const leaderboardUpdatePayloadSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
  you: yourStandingSchema.nullable(),
});
export type LeaderboardUpdatePayload = z.infer<typeof leaderboardUpdatePayloadSchema>;

export const sessionEndPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  endedAtServerMs: z.number(),
  entries: z.array(leaderboardEntrySchema),
  you: yourStandingSchema.nullable(),
});
export type SessionEndPayload = z.infer<typeof sessionEndPayloadSchema>;

export const adaptiveRowSchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  rating: z.number(),
  lastDifficulty: difficultySchema.nullable(),
  lastCorrect: z.boolean().nullable(),
});
export type AdaptiveRow = z.infer<typeof adaptiveRowSchema>;

export const adaptiveRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  totalRounds: z.number().int().positive(),
  startsAtServerMs: z.number(),
  durationMs: z.number().int().positive(),
});
export type AdaptiveRound = z.infer<typeof adaptiveRoundSchema>;

export const roomStatePayloadSchema = z.object({
  sessionId: z.string().uuid(),
  joinCode: z.string(),
  status: sessionStatusSchema,
  role: z.enum(['host', 'student']),
  serverNowMs: z.number(),
  participants: z.array(participantPresenceSchema),
  currentQuestion: questionShowPayloadSchema
    .extend({
      questionNumber: z.number().int().positive(),
      totalQuestions: z.number().int().positive(),
    })
    .nullable(),
  questionClosed: z.boolean(),
  adaptive: z.boolean(),
  round: adaptiveRoundSchema.nullable(),
  adaptiveTable: z.array(adaptiveRowSchema).nullable(),
  youAnswered: z.boolean(),
  answeredCount: z.number().int().nonnegative().nullable(),
  lastResult: questionResultPayloadSchema.nullable(),
  leaderboard: z.array(leaderboardEntrySchema),
  you: z
    .object({
      participantId: z.string().uuid(),
      displayName: z.string(),
      score: z.number(),
      rank: z.number().int().positive(),
    })
    .nullable(),
});
export type RoomStatePayload = z.infer<typeof roomStatePayloadSchema>;

export const timePongPayloadSchema = z.object({
  clientSentMs: z.number(),
  serverNowMs: z.number(),
});
export type TimePongPayload = z.infer<typeof timePongPayloadSchema>;

export interface ClientToServerEvents {
  'room:join': (payload: RoomJoinPayload, ack: (response: RoomJoinAck) => void) => void;
  'answer:submit': (payload: AnswerSubmitPayload, ack: (response: AnswerSubmitAck) => void) => void;
  'time:ping': (payload: TimePingPayload, ack: (response: TimePingAck) => void) => void;
  'proctor:event': (payload: ProctorEventPayload, ack: (response: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (payload: RoomStatePayload) => void;
  'question:show': (payload: QuestionShowPayload) => void;
  'question:result': (payload: QuestionResultPayload) => void;
  'leaderboard:update': (payload: LeaderboardUpdatePayload) => void;
  'session:end': (payload: SessionEndPayload) => void;
  'time:pong': (payload: TimePongPayload) => void;
}
