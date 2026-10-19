import type { Participant, ServerToClientEvents, Session, SocketErrorCode } from '@quizup/shared';

export interface LiveQuestion {
  id: string;
  stem: string;
  options: string[];
  correctIndex: number;
}

export interface NewParticipantInput {
  sessionId: string;
  displayName: string;
  rejoinTokenHash: string;
}

export interface NewResponseInput {
  sessionId: string;
  participantId: string;
  questionId: string;
  chosenIndex: number;
  correct: boolean;
  responseMs: number;
  points: number;
  servedAtIso: string;
  answeredAtIso: string;
}

export interface SessionUpdate {
  status?: Session['status'];
  started_at?: string;
  ended_at?: string;
}

export interface LiveRepository {
  findOwnedQuiz: (quizId: string, hostId: string) => Promise<{ id: string; title: string } | null>;
  listApprovedQuestions: (quizId: string) => Promise<LiveQuestion[]>;
  loadQuestionsByIds: (questionIds: string[]) => Promise<(LiveQuestion & { approved: boolean })[]>;
  createSession: (input: {
    quizId: string;
    joinCode: string;
    questionIds: string[];
  }) => Promise<Session | null>;
  findSessionWithHost: (sessionId: string) => Promise<{ session: Session; hostId: string } | null>;
  updateSession: (sessionId: string, update: SessionUpdate) => Promise<void>;
  insertParticipant: (input: NewParticipantInput) => Promise<Participant | 'name_taken'>;
  insertResponse: (input: NewResponseInput) => Promise<'inserted' | 'duplicate'>;
  endAllNonEndedSessions: (endedAtIso: string) => Promise<void>;
}

export type EngineEventName = keyof ServerToClientEvents;

export interface LivePublisher {
  emitToSession: <Event extends EngineEventName>(
    sessionId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) => void;
  emitToHost: <Event extends EngineEventName>(
    sessionId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) => void;
  emitToParticipant: <Event extends EngineEventName>(
    participantId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) => void;
}

export type EngineErrorCode =
  | 'session_not_found'
  | 'quiz_not_found'
  | 'no_approved_questions'
  | 'questions_not_approved'
  | 'invalid_session_state'
  | 'question_still_open'
  | 'join_code_exhausted';

const ENGINE_ERROR_STATUS: Record<EngineErrorCode, number> = {
  session_not_found: 404,
  quiz_not_found: 404,
  no_approved_questions: 400,
  questions_not_approved: 409,
  invalid_session_state: 409,
  question_still_open: 409,
  join_code_exhausted: 503,
};

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly status: number;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = ENGINE_ERROR_STATUS[code];
  }
}

export type EngineFailure = { ok: false; error: SocketErrorCode };
