import type {
  Difficulty,
  ExamProgressRow,
  ExamStudentView,
  Participant,
  ProctorEventRecord,
  ServerToClientEvents,
  Session,
  SocketErrorCode,
} from '@quizup/shared';

export interface LiveQuestion {
  id: string;
  stem: string;
  options: string[];
  correctIndex: number;
  topic: string;
  difficulty: Difficulty;
  eloRating: number;
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

export interface LiveRepository extends ExamRepository {
  findOwnedQuiz: (
    quizId: string,
    hostId: string,
  ) => Promise<{ id: string; title: string; settings: unknown } | null>;
  listApprovedQuestions: (quizId: string) => Promise<LiveQuestion[]>;
  loadQuestionsByIds: (questionIds: string[]) => Promise<(LiveQuestion & { approved: boolean })[]>;
  createSession: (input: {
    quizId: string;
    joinCode: string;
    questionIds: string[];
    examDurationMinutes: number | null;
  }) => Promise<Session | null>;
  findSessionWithHost: (sessionId: string) => Promise<{ session: Session; hostId: string } | null>;
  updateSession: (sessionId: string, update: SessionUpdate) => Promise<void>;
  insertParticipant: (input: NewParticipantInput) => Promise<Participant | 'name_taken'>;
  insertResponse: (input: NewResponseInput) => Promise<'inserted' | 'duplicate'>;
  recordResponseRatings: (input: {
    participantId: string;
    questionId: string;
    participantEloBefore: number;
    questionEloBefore: number;
  }) => Promise<void>;
  applyQuestionRatingDelta: (questionId: string, delta: number) => Promise<number>;
  updateParticipantElo: (participantId: string, elo: number) => Promise<void>;
  upsertKnowledgeState: (input: {
    participantId: string;
    topic: string;
    pMastery: number;
  }) => Promise<void>;
  findSummaryRecord: (sessionId: string) => Promise<SummaryRecord | null>;
  saveSessionSummary: (
    sessionId: string,
    summary: unknown,
    generatedAtIso: string,
  ) => Promise<void>;
  loadSessionAnalyticsSource: (sessionId: string) => Promise<SessionAnalyticsSource | null>;
  endAllNonEndedSessions: (endedAtIso: string) => Promise<void>;
}

export interface ExamAttemptRecord {
  id: string;
  sessionId: string;
  participantId: string;
  consentAtMs: number;
  consentVersion: string;
  startedAtMs: number;
  deadlineAtMs: number;
  submittedAtMs: number | null;
  shuffleSeed: number;
  questionOrder: string[];
  optionOrders: Record<string, number[]>;
}

export interface ExamAnswerRecord {
  attemptId: string;
  questionId: string;
  chosenOriginalIndex: number;
  savedAtMs: number;
}

export interface OpenExamSession {
  session: Session;
  hostId: string;
  participants: {
    id: string;
    displayName: string;
    elo: number;
    joinedAtMs: number;
    tokenHash: string;
  }[];
}

export interface ExamRepository {
  listOpenExamSessions: () => Promise<OpenExamSession[]>;
  listExamAttempts: (sessionId: string) => Promise<ExamAttemptRecord[]>;
  createExamAttempt: (attempt: ExamAttemptRecord) => Promise<ExamAttemptRecord>;
  submitExamAttempt: (attemptId: string, submittedAtMs: number) => Promise<boolean>;
  upsertExamAnswer: (answer: ExamAnswerRecord) => Promise<void>;
  listExamAnswers: (attemptId: string) => Promise<ExamAnswerRecord[]>;
  insertProctorEvents: (events: ProctorEventRecord[]) => Promise<void>;
  listProctorEvents: (sessionId: string) => Promise<ProctorEventRecord[]>;
  listParticipantNames: (sessionId: string) => Promise<{ id: string; displayName: string }[]>;
  setResultsReleased: (sessionId: string, releasedAtMs: number) => Promise<number>;
}

export interface SessionAnalyticsSource {
  session: Session;
  hostId: string;
  proctorEvents: { participantId: string; type: string }[];
  participants: { id: string; displayName: string; elo: number; joinedAtMs: number }[];
  questions: {
    id: string;
    stem: string;
    options: string[];
    topic: string;
    difficulty: Difficulty;
  }[];
  responses: {
    participantId: string;
    questionId: string;
    chosenIndex: number;
    correct: boolean;
    responseMs: number;
    points: number;
    answeredAtMs: number;
    participantEloBefore: number | null;
    questionEloBefore: number | null;
  }[];
  knowledgeStates: { participantId: string; topic: string; pMastery: number }[];
}

export interface SummaryRecord {
  session: Session;
  hostId: string;
  storedSummary: unknown;
}

export interface ExamContext {
  sessionId: string;
  status: Session['status'];
  hostId: string;
  durationMs: number;
  questions: LiveQuestion[];
  resultsReleasedAtMs: number | null;
}

export interface ExamHooks {
  studentView: (sessionId: string, participantId: string) => ExamStudentView | null;
  hostProgress: (sessionId: string) => ExamProgressRow[] | null;
  beforeSessionEnds: (sessionId: string) => Promise<void>;
  loadRehydrated: (sessionId: string) => Promise<void>;
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
