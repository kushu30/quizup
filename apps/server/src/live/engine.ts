import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  ANSWER_GRACE_MS,
  LEADERBOARD_SIZE,
  QUESTION_OPTION_COUNT,
  QUESTION_START_DELAY_MS,
  computePoints,
  clampResponseMs,
  generateJoinCode,
  getAnswerWindowStatus,
  type Ack,
  type AnswerSubmitPayload,
  type LeaderboardEntry,
  type QuestionResultPayload,
  type RoomJoinAck,
  type RoomStatePayload,
  type Session,
  type SessionStatus,
  type SessionSummary,
  type StudentJoinPayload,
  type YourQuestionResult,
} from '@quizup/shared';
import {
  EngineError,
  type LiveQuestion,
  type LivePublisher,
  type LiveRepository,
} from './types.js';

const JOIN_CODE_ATTEMPTS = 20;
const DEFAULT_HOST_REFRESH_INTERVAL_MS = 200;
const DEFAULT_ENDED_RETENTION_MS = 10 * 60 * 1000;

export interface LiveEngineOptions {
  repository: LiveRepository;
  publisher: LivePublisher;
  now?: () => number;
  startDelayMs?: number;
  graceMs?: number;
  hostRefreshIntervalMs?: number;
  endedSessionRetentionMs?: number;
  randomIndex?: (exclusiveMax: number) => number;
}

interface AnswerRecord {
  chosenIndex: number;
  correct: boolean;
  points: number;
  responseMs: number;
}

interface ParticipantState {
  id: string;
  displayName: string;
  joinedAtMs: number;
  tokenHash: string;
  connected: boolean;
  score: number;
  totalResponseMs: number;
  answers: Map<string, AnswerRecord>;
}

interface QuestionRun {
  index: number;
  question: LiveQuestion;
  startsAtServerMs: number;
  durationMs: number;
  closed: boolean;
  optionCounts: number[];
  closeTimer: NodeJS.Timeout | null;
}

interface StoredResult {
  base: Omit<QuestionResultPayload, 'you'>;
  perParticipant: Map<string, YourQuestionResult>;
}

interface SessionState {
  record: Session;
  hostId: string;
  durationMs: number;
  questions: LiveQuestion[];
  participants: Map<string, ParticipantState>;
  participantIdByName: Map<string, string>;
  reservedNames: Set<string>;
  run: QuestionRun | null;
  lastResult: StoredResult | null;
  hostRefreshTimer: NodeJS.Timeout | null;
  retentionTimer: NodeJS.Timeout | null;
}

export type RoomViewer = { role: 'host' } | { role: 'student'; participantId: string };

function hashRejoinToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenHashesMatch(candidateHash: string, storedHash: string): boolean {
  const candidate = Buffer.from(candidateHash, 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export class LiveEngine {
  private readonly repository: LiveRepository;
  private readonly publisher: LivePublisher;
  private readonly now: () => number;
  private readonly startDelayMs: number;
  private readonly graceMs: number;
  private readonly hostRefreshIntervalMs: number;
  private readonly endedSessionRetentionMs: number;
  private readonly randomIndex: (exclusiveMax: number) => number;
  private readonly sessionsById = new Map<string, SessionState>();
  private readonly sessionIdByJoinCode = new Map<string, string>();
  private readonly sessionIdByParticipantId = new Map<string, string>();

  constructor(options: LiveEngineOptions) {
    this.repository = options.repository;
    this.publisher = options.publisher;
    this.now = options.now ?? Date.now;
    this.startDelayMs = options.startDelayMs ?? QUESTION_START_DELAY_MS;
    this.graceMs = options.graceMs ?? ANSWER_GRACE_MS;
    this.hostRefreshIntervalMs = options.hostRefreshIntervalMs ?? DEFAULT_HOST_REFRESH_INTERVAL_MS;
    this.endedSessionRetentionMs = options.endedSessionRetentionMs ?? DEFAULT_ENDED_RETENTION_MS;
    this.randomIndex = options.randomIndex ?? ((exclusiveMax) => randomInt(exclusiveMax));
  }

  async markAllStoredSessionsEnded(): Promise<void> {
    await this.repository.endAllNonEndedSessions(new Date(this.now()).toISOString());
  }

  async createSession(input: {
    quizId: string;
    hostId: string;
    questionDurationMs: number;
  }): Promise<SessionSummary> {
    const quiz = await this.repository.findOwnedQuiz(input.quizId, input.hostId);
    if (!quiz) {
      throw new EngineError('quiz_not_found', 'Quiz not found');
    }
    const approvedQuestions = await this.repository.listApprovedQuestions(quiz.id);
    if (approvedQuestions.length === 0) {
      throw new EngineError(
        'no_approved_questions',
        'The quiz needs at least one approved question',
      );
    }

    const questions = this.shuffle(approvedQuestions);
    const questionIds = questions.map((question) => question.id);

    for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
      const joinCode = generateJoinCode(this.randomIndex);
      if (this.sessionIdByJoinCode.has(joinCode)) {
        continue;
      }
      const record = await this.repository.createSession({
        quizId: quiz.id,
        joinCode,
        questionIds,
      });
      if (!record) {
        continue;
      }
      const state: SessionState = {
        record,
        hostId: input.hostId,
        durationMs: input.questionDurationMs,
        questions,
        participants: new Map(),
        participantIdByName: new Map(),
        reservedNames: new Set(),
        run: null,
        lastResult: null,
        hostRefreshTimer: null,
        retentionTimer: null,
      };
      this.sessionsById.set(record.id, state);
      this.sessionIdByJoinCode.set(record.join_code, record.id);
      return this.summarize(state);
    }
    throw new EngineError('join_code_exhausted', 'Could not allocate a join code');
  }

  async getSummary(sessionId: string, hostId: string): Promise<SessionSummary> {
    const state = this.sessionsById.get(sessionId);
    if (state) {
      this.assertHost(state, hostId);
      return this.summarize(state);
    }
    const stored = await this.repository.findSessionWithHost(sessionId);
    if (!stored || stored.hostId !== hostId) {
      throw new EngineError('session_not_found', 'Session not found');
    }
    return {
      session: stored.session,
      joinCode: stored.session.join_code,
      questionDurationSeconds: null,
      questionCount: stored.session.question_ids.length,
      currentQuestionNumber: null,
      participantCount: 0,
    };
  }

  async startSession(sessionId: string, hostId: string): Promise<SessionSummary> {
    const state = this.requireHostedSession(sessionId, hostId);
    if (state.record.status !== 'lobby') {
      throw new EngineError('invalid_session_state', 'The session has already started');
    }
    const startedAtIso = new Date(this.now()).toISOString();
    await this.repository.updateSession(state.record.id, {
      status: 'running',
      started_at: startedAtIso,
    });
    state.record = { ...state.record, status: 'running', started_at: startedAtIso };
    this.showQuestion(state, 0);
    return this.summarize(state);
  }

  async nextQuestion(sessionId: string, hostId: string): Promise<SessionSummary> {
    const state = this.requireHostedSession(sessionId, hostId);
    if (state.record.status !== 'running' || !state.run) {
      throw new EngineError('invalid_session_state', 'The session is not running');
    }
    if (!state.run.closed) {
      throw new EngineError('question_still_open', 'The current question is still open');
    }
    const nextIndex = state.run.index + 1;
    if (nextIndex >= state.questions.length) {
      await this.finishSession(state);
    } else {
      this.showQuestion(state, nextIndex);
    }
    return this.summarize(state);
  }

  async endSession(sessionId: string, hostId: string): Promise<SessionSummary> {
    const state = this.requireHostedSession(sessionId, hostId);
    if (state.record.status !== 'ended') {
      await this.finishSession(state);
    }
    return this.summarize(state);
  }

  authorizeHost(sessionId: string, userId: string): Ack<{ sessionId: string }> {
    const state = this.sessionsById.get(sessionId);
    if (!state) {
      return { ok: false, error: 'session_not_found' };
    }
    if (state.hostId !== userId) {
      return { ok: false, error: 'forbidden' };
    }
    return { ok: true, sessionId };
  }

  async joinStudent(payload: StudentJoinPayload): Promise<RoomJoinAck> {
    const sessionId = this.sessionIdByJoinCode.get(payload.joinCode);
    const state = sessionId ? this.sessionsById.get(sessionId) : undefined;
    if (!state) {
      return { ok: false, error: 'session_not_found' };
    }

    const nameKey = payload.displayName.toLowerCase();
    const existingId = state.participantIdByName.get(nameKey);

    if (payload.rejoinToken !== undefined) {
      const existing = existingId ? state.participants.get(existingId) : undefined;
      const candidateHash = hashRejoinToken(payload.rejoinToken);
      if (!existing || !tokenHashesMatch(candidateHash, existing.tokenHash)) {
        return { ok: false, error: 'invalid_rejoin_token' };
      }
      return {
        ok: true,
        role: 'student',
        sessionId: state.record.id,
        participantId: existing.id,
        rejoinToken: payload.rejoinToken,
      };
    }

    if (existingId || state.reservedNames.has(nameKey)) {
      return { ok: false, error: 'name_taken' };
    }
    if (state.record.status === 'ended') {
      return { ok: false, error: 'session_ended' };
    }
    if (state.record.status !== 'lobby') {
      return { ok: false, error: 'session_started' };
    }

    state.reservedNames.add(nameKey);
    const rejoinToken = randomBytes(32).toString('hex');
    try {
      const inserted = await this.repository.insertParticipant({
        sessionId: state.record.id,
        displayName: payload.displayName,
        rejoinTokenHash: hashRejoinToken(rejoinToken),
      });
      if (inserted === 'name_taken') {
        return { ok: false, error: 'name_taken' };
      }
      const participant: ParticipantState = {
        id: inserted.id,
        displayName: inserted.display_name,
        joinedAtMs: Date.parse(inserted.joined_at),
        tokenHash: hashRejoinToken(rejoinToken),
        connected: false,
        score: 0,
        totalResponseMs: 0,
        answers: new Map(),
      };
      state.participants.set(participant.id, participant);
      state.participantIdByName.set(nameKey, participant.id);
      this.sessionIdByParticipantId.set(participant.id, state.record.id);
      this.requestHostRefresh(state);
      return {
        ok: true,
        role: 'student',
        sessionId: state.record.id,
        participantId: participant.id,
        rejoinToken,
      };
    } finally {
      state.reservedNames.delete(nameKey);
    }
  }

  setParticipantConnected(participantId: string, connected: boolean): void {
    const state = this.findStateByParticipant(participantId);
    const participant = state?.participants.get(participantId);
    if (!state || !participant || participant.connected === connected) {
      return;
    }
    participant.connected = connected;
    this.requestHostRefresh(state);
    if (!connected) {
      this.closeIfEveryoneConnectedAnswered(state);
    }
  }

  async submitAnswer(participantId: string, payload: AnswerSubmitPayload): Promise<Ack> {
    const receivedAtMs = this.now();
    const state = this.findStateByParticipant(participantId);
    const participant = state?.participants.get(participantId);
    if (!state || !participant) {
      return { ok: false, error: 'not_in_room' };
    }
    const run = state.run;
    if (state.record.status !== 'running' || !run) {
      return { ok: false, error: 'no_active_question' };
    }
    if (run.question.id !== payload.questionId) {
      return { ok: false, error: 'wrong_question' };
    }
    if (run.closed) {
      return { ok: false, error: 'too_late' };
    }
    const windowStatus = getAnswerWindowStatus({
      receivedAtMs,
      startsAtServerMs: run.startsAtServerMs,
      durationMs: run.durationMs,
      graceMs: this.graceMs,
    });
    if (windowStatus !== 'ok') {
      return { ok: false, error: windowStatus };
    }
    if (participant.answers.has(run.question.id)) {
      return { ok: false, error: 'already_answered' };
    }

    const correct = payload.chosenIndex === run.question.correctIndex;
    const responseMs = Math.round(
      clampResponseMs(receivedAtMs - run.startsAtServerMs, run.durationMs),
    );
    const points = computePoints({ correct, responseMs, durationMs: run.durationMs });
    const record: AnswerRecord = { chosenIndex: payload.chosenIndex, correct, points, responseMs };

    participant.answers.set(run.question.id, record);
    participant.score += points;
    participant.totalResponseMs += responseMs;
    run.optionCounts[payload.chosenIndex] = (run.optionCounts[payload.chosenIndex] ?? 0) + 1;

    try {
      await this.repository.insertResponse({
        sessionId: state.record.id,
        participantId,
        questionId: run.question.id,
        chosenIndex: payload.chosenIndex,
        correct,
        responseMs,
        points,
        servedAtIso: new Date(run.startsAtServerMs).toISOString(),
        answeredAtIso: new Date(receivedAtMs).toISOString(),
      });
    } catch (error) {
      console.error(error);
      participant.answers.delete(run.question.id);
      participant.score -= points;
      participant.totalResponseMs -= responseMs;
      run.optionCounts[payload.chosenIndex] = (run.optionCounts[payload.chosenIndex] ?? 1) - 1;
      return { ok: false, error: 'server_error' };
    }

    this.requestHostRefresh(state);
    this.closeIfEveryoneConnectedAnswered(state);
    return { ok: true };
  }

  getRoomState(sessionId: string, viewer: RoomViewer): RoomStatePayload | null {
    const state = this.sessionsById.get(sessionId);
    if (!state) {
      return null;
    }
    return this.buildRoomState(state, viewer);
  }

  getSessionIdForParticipant(participantId: string): string | undefined {
    return this.sessionIdByParticipantId.get(participantId);
  }

  shutdown(): void {
    for (const state of this.sessionsById.values()) {
      this.clearTimers(state);
    }
  }

  private shuffle<Item>(items: Item[]): Item[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.randomIndex(index + 1);
      const held = shuffled[index] as Item;
      shuffled[index] = shuffled[swapIndex] as Item;
      shuffled[swapIndex] = held;
    }
    return shuffled;
  }

  private assertHost(state: SessionState, hostId: string) {
    if (state.hostId !== hostId) {
      throw new EngineError('session_not_found', 'Session not found');
    }
  }

  private requireHostedSession(sessionId: string, hostId: string): SessionState {
    const state = this.sessionsById.get(sessionId);
    if (!state) {
      throw new EngineError('session_not_found', 'Session not found');
    }
    this.assertHost(state, hostId);
    return state;
  }

  private findStateByParticipant(participantId: string): SessionState | undefined {
    const sessionId = this.sessionIdByParticipantId.get(participantId);
    return sessionId ? this.sessionsById.get(sessionId) : undefined;
  }

  private summarize(state: SessionState): SessionSummary {
    return {
      session: state.record,
      joinCode: state.record.join_code,
      questionDurationSeconds: Math.round(state.durationMs / 1000),
      questionCount: state.questions.length,
      currentQuestionNumber: state.run ? state.run.index + 1 : null,
      participantCount: state.participants.size,
    };
  }

  private showQuestion(state: SessionState, index: number) {
    const question = state.questions[index];
    if (!question) {
      return;
    }
    const run: QuestionRun = {
      index,
      question,
      startsAtServerMs: this.now() + this.startDelayMs,
      durationMs: state.durationMs,
      closed: false,
      optionCounts: new Array<number>(QUESTION_OPTION_COUNT).fill(0),
      closeTimer: null,
    };
    state.run = run;
    state.lastResult = null;

    this.publisher.emitToSession(state.record.id, 'question:show', {
      questionId: question.id,
      stem: question.stem,
      options: question.options,
      startsAtServerMs: run.startsAtServerMs,
      durationMs: run.durationMs,
    });
    this.flushHostState(state);
    this.armCloseTimer(state, run);
  }

  private armCloseTimer(state: SessionState, run: QuestionRun) {
    const deadlineMs = run.startsAtServerMs + run.durationMs + this.graceMs;
    const check = () => {
      run.closeTimer = null;
      if (run.closed || state.run !== run) {
        return;
      }
      const remainingMs = deadlineMs - this.now();
      if (remainingMs > 0) {
        run.closeTimer = setTimeout(check, remainingMs);
        run.closeTimer.unref();
        return;
      }
      this.closeQuestion(state);
    };
    const initialDelayMs = Math.max(deadlineMs - this.now(), 0);
    run.closeTimer = setTimeout(check, initialDelayMs);
    run.closeTimer.unref();
  }

  private closeIfEveryoneConnectedAnswered(state: SessionState) {
    const run = state.run;
    if (!run || run.closed || state.record.status !== 'running') {
      return;
    }
    const connected = [...state.participants.values()].filter(
      (participant) => participant.connected,
    );
    if (connected.length === 0) {
      return;
    }
    if (connected.every((participant) => participant.answers.has(run.question.id))) {
      this.closeQuestion(state);
    }
  }

  private rankParticipants(state: SessionState): ParticipantState[] {
    return [...state.participants.values()].sort(
      (first, second) =>
        second.score - first.score ||
        first.totalResponseMs - second.totalResponseMs ||
        first.joinedAtMs - second.joinedAtMs ||
        first.id.localeCompare(second.id),
    );
  }

  private buildLeaderboard(ranked: ParticipantState[]): LeaderboardEntry[] {
    return ranked.slice(0, LEADERBOARD_SIZE).map((participant, position) => ({
      participantId: participant.id,
      displayName: participant.displayName,
      score: participant.score,
      rank: position + 1,
    }));
  }

  private closeQuestion(state: SessionState) {
    const run = state.run;
    if (!run || run.closed) {
      return;
    }
    run.closed = true;
    if (run.closeTimer) {
      clearTimeout(run.closeTimer);
      run.closeTimer = null;
    }

    const ranked = this.rankParticipants(state);
    const rankById = new Map(ranked.map((participant, position) => [participant.id, position + 1]));
    const entries = this.buildLeaderboard(ranked);

    const base: Omit<QuestionResultPayload, 'you'> = {
      questionId: run.question.id,
      correctIndex: run.question.correctIndex,
      optionCounts: [...run.optionCounts],
    };
    const perParticipant = new Map<string, YourQuestionResult>();

    for (const participant of ranked) {
      const answer = participant.answers.get(run.question.id);
      perParticipant.set(participant.id, {
        chosenIndex: answer?.chosenIndex ?? null,
        correct: answer?.correct ?? false,
        pointsAwarded: answer?.points ?? 0,
        totalPoints: participant.score,
        rank: rankById.get(participant.id) ?? ranked.length,
      });
    }
    state.lastResult = { base, perParticipant };

    this.publisher.emitToHost(state.record.id, 'question:result', { ...base, you: null });
    this.publisher.emitToHost(state.record.id, 'leaderboard:update', { entries, you: null });
    for (const participant of ranked) {
      this.publisher.emitToParticipant(participant.id, 'question:result', {
        ...base,
        you: perParticipant.get(participant.id) ?? null,
      });
      this.publisher.emitToParticipant(participant.id, 'leaderboard:update', {
        entries,
        you: { rank: rankById.get(participant.id) ?? ranked.length, score: participant.score },
      });
    }
    this.flushHostState(state);
  }

  private async finishSession(state: SessionState) {
    if (state.record.status === 'ended') {
      return;
    }
    if (state.run && !state.run.closed) {
      state.run.closed = true;
    }
    this.clearTimers(state);

    const endedAtMs = this.now();
    const endedAtIso = new Date(endedAtMs).toISOString();
    state.record = { ...state.record, status: 'ended', ended_at: endedAtIso };

    const ranked = this.rankParticipants(state);
    const entries = this.buildLeaderboard(ranked);
    const sessionId = state.record.id;

    this.publisher.emitToHost(sessionId, 'session:end', {
      sessionId,
      endedAtServerMs: endedAtMs,
      entries,
      you: null,
    });
    ranked.forEach((participant, position) => {
      this.publisher.emitToParticipant(participant.id, 'session:end', {
        sessionId,
        endedAtServerMs: endedAtMs,
        entries,
        you: { rank: position + 1, score: participant.score },
      });
    });
    this.flushHostState(state);

    state.retentionTimer = setTimeout(
      () => this.forgetSession(state),
      this.endedSessionRetentionMs,
    );
    state.retentionTimer.unref();

    await this.repository.updateSession(sessionId, { status: 'ended', ended_at: endedAtIso });
  }

  private forgetSession(state: SessionState) {
    this.clearTimers(state);
    this.sessionsById.delete(state.record.id);
    this.sessionIdByJoinCode.delete(state.record.join_code);
    for (const participantId of state.participants.keys()) {
      this.sessionIdByParticipantId.delete(participantId);
    }
  }

  private clearTimers(state: SessionState) {
    if (state.run?.closeTimer) {
      clearTimeout(state.run.closeTimer);
      state.run.closeTimer = null;
    }
    if (state.hostRefreshTimer) {
      clearTimeout(state.hostRefreshTimer);
      state.hostRefreshTimer = null;
    }
    if (state.retentionTimer) {
      clearTimeout(state.retentionTimer);
      state.retentionTimer = null;
    }
  }

  private requestHostRefresh(state: SessionState) {
    if (state.hostRefreshTimer || state.record.status === 'ended') {
      return;
    }
    state.hostRefreshTimer = setTimeout(() => {
      state.hostRefreshTimer = null;
      this.flushHostState(state);
    }, this.hostRefreshIntervalMs);
    state.hostRefreshTimer.unref();
  }

  private flushHostState(state: SessionState) {
    if (state.hostRefreshTimer) {
      clearTimeout(state.hostRefreshTimer);
      state.hostRefreshTimer = null;
    }
    this.publisher.emitToHost(
      state.record.id,
      'room:state',
      this.buildRoomState(state, { role: 'host' }),
    );
  }

  private buildRoomState(state: SessionState, viewer: RoomViewer): RoomStatePayload {
    const run = state.record.status === 'ended' ? null : state.run;
    const ranked = this.rankParticipants(state);
    const status: SessionStatus = state.record.status;

    let you: RoomStatePayload['you'] = null;
    let youAnswered = false;
    let lastResult: QuestionResultPayload | null = null;

    if (state.lastResult && run?.closed) {
      const personal =
        viewer.role === 'student'
          ? (state.lastResult.perParticipant.get(viewer.participantId) ?? null)
          : null;
      lastResult = { ...state.lastResult.base, you: personal };
    }

    if (viewer.role === 'student') {
      const participant = state.participants.get(viewer.participantId);
      if (participant) {
        const position = ranked.findIndex((candidate) => candidate.id === participant.id);
        you = {
          participantId: participant.id,
          displayName: participant.displayName,
          score: participant.score,
          rank: position + 1,
        };
        youAnswered = run ? participant.answers.has(run.question.id) : false;
      }
    }

    const answeredCount =
      viewer.role === 'host' && run
        ? [...state.participants.values()].filter((participant) =>
            participant.answers.has(run.question.id),
          ).length
        : null;

    return {
      sessionId: state.record.id,
      joinCode: state.record.join_code,
      status,
      role: viewer.role,
      serverNowMs: this.now(),
      participants: [...state.participants.values()]
        .sort((first, second) => first.joinedAtMs - second.joinedAtMs)
        .map((participant) => ({
          participantId: participant.id,
          displayName: participant.displayName,
          connected: participant.connected,
        })),
      currentQuestion: run
        ? {
            questionId: run.question.id,
            stem: run.question.stem,
            options: run.question.options,
            startsAtServerMs: run.startsAtServerMs,
            durationMs: run.durationMs,
            questionNumber: run.index + 1,
            totalQuestions: state.questions.length,
          }
        : null,
      questionClosed: run?.closed ?? false,
      youAnswered,
      answeredCount,
      lastResult,
      leaderboard: this.buildLeaderboard(ranked),
      you,
    };
  }
}
