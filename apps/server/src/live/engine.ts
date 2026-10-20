import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  ANALYTICS_THROTTLE_MS,
  ANSWER_GRACE_MS,
  DEFAULT_BKT_PARAMS,
  INITIAL_PLAYER_RATING,
  LEADERBOARD_SIZE,
  QUESTION_OPTION_COUNT,
  QUESTION_START_DELAY_MS,
  REJOIN_WINDOW_MS,
  formatAccessToken,
  generateAccessToken,
  normalizeAccessToken,
  bktUpdate,
  clampRating,
  clampResponseMs,
  computePoints,
  generateJoinCode,
  getAnswerWindowStatus,
  normalizeTopicKey,
  parseUserAgent,
  sameDevice,
  selectNextAdaptiveQuestion,
  quizSettingsSchema,
  resolveAdaptiveRounds,
  updateRatings,
  type AccessMode,
  type Ack,
  type AllowRejoinResponse,
  type AdaptiveRow,
  type AnalyticsSnapshot,
  type AnswerSubmitPayload,
  type Difficulty,
  type LeaderboardEntry,
  type RandomSource,
  type QuestionResultPayload,
  type RoomJoinAck,
  type RosterAddResponse,
  type RosterEntry,
  type RosterReissueResponse,
  type RosterStudentInput,
  splitStoredBranding,
  type Branding,
  type ClientHints,
  type DeviceInfo,
  type JoinInfo,
  type RoomStatePayload,
  type Session,
  type SessionStatus,
  type SessionSummary,
  type StudentJoinPayload,
  type QuizSettings,
  type YourQuestionResult,
} from '@quizup/shared';
import { SessionAnalytics } from '../analytics/sessionAnalytics.js';
import { createCryptoRandomSource } from './randomSource.js';
import { SessionRoster, type RosterItem } from './sessionRoster.js';
import {
  EngineError,
  type ExamContext,
  type ExamHooks,
  type LiveQuestion,
  type LivePublisher,
  type LiveRepository,
} from './types.js';

const JOIN_CODE_ATTEMPTS = 20;
const MAX_DEVICES_PER_STUDENT = 5;
const DEFAULT_HOST_REFRESH_INTERVAL_MS = 200;
const DEFAULT_ENDED_RETENTION_MS = 10 * 60 * 1000;
export const EXAM_ENDED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface LiveEngineOptions {
  repository: LiveRepository;
  publisher: LivePublisher;
  now?: () => number;
  startDelayMs?: number;
  graceMs?: number;
  hostRefreshIntervalMs?: number;
  endedSessionRetentionMs?: number;
  endedExamRetentionMs?: number;
  randomIndex?: (exclusiveMax: number) => number;
  random?: RandomSource;
  analyticsThrottleMs?: number;
}

interface AnswerRecord {
  chosenIndex: number;
  correct: boolean;
  points: number;
  responseMs: number;
  answeredAtMs: number;
}

interface LastOutcome {
  difficulty: Difficulty;
  correct: boolean;
}

interface ParticipantState {
  id: string;
  displayName: string;
  joinedAtMs: number;
  tokenHash: string;
  userId: string | null;
  connected: boolean;
  rejoinOpenUntilMs: number | null;
  devices: DeviceInfo[];
  score: number;
  totalResponseMs: number;
  elo: number;
  answers: Map<string, AnswerRecord>;
  servedQuestionIds: Set<string>;
  mastery: Map<string, number>;
  lastOutcome: LastOutcome | null;
}

interface QuestionRun {
  index: number;
  assignments: Map<string, LiveQuestion>;
  sharedQuestion: LiveQuestion | null;
  startsAtServerMs: number;
  durationMs: number;
  closed: boolean;
  optionCounts: number[] | null;
  closeTimer: NodeJS.Timeout | null;
}

interface StoredResult {
  hostResult: QuestionResultPayload | null;
  perParticipant: Map<string, QuestionResultPayload>;
}

interface RatingJob {
  question: LiveQuestion;
  participantId: string;
  topicKey: string;
  participantEloBefore: number;
  participantEloAfter: number;
  questionEloBefore: number;
  questionDelta: number;
  masteryAfter: number;
}

interface SessionState {
  record: Session;
  hostId: string;
  durationMs: number;
  questions: LiveQuestion[];
  adaptiveRounds: number | null;
  totalRounds: number;
  persistence: Promise<void>;
  analytics: SessionAnalytics;
  analyticsTimer: NodeJS.Timeout | null;
  exam: { durationMs: number } | null;
  quizTitle: string;
  branding: Branding | null;
  accessMode: AccessMode;
  roster: SessionRoster;
  resultsReleasedAtMs: number | null;
  finishing: boolean;
  participants: Map<string, ParticipantState>;
  participantIdByName: Map<string, string>;
  reservedNames: Set<string>;
  run: QuestionRun | null;
  lastResult: StoredResult | null;
  hostRefreshTimer: NodeJS.Timeout | null;
  retentionTimer: NodeJS.Timeout | null;
}

export type RoomViewer = { role: 'host' } | { role: 'student'; participantId: string };

function accessModeOf(storedSettings: unknown): AccessMode {
  const parsed = quizSettingsSchema.safeParse(splitStoredBranding(storedSettings).settings);
  return parsed.success ? parsed.data.accessMode : 'open';
}

function hashRejoinToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenHashesMatch(candidateHash: string, storedHash: string): boolean {
  const candidate = Buffer.from(candidateHash, 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export class LiveEngine {
  readonly repository: LiveRepository;
  private readonly publisher: LivePublisher;
  private readonly now: () => number;
  private readonly startDelayMs: number;
  private readonly graceMs: number;
  private readonly hostRefreshIntervalMs: number;
  private readonly endedSessionRetentionMs: number;
  private readonly endedExamRetentionMs: number;
  private readonly randomIndex: (exclusiveMax: number) => number;
  private readonly random: RandomSource;
  private readonly analyticsThrottleMs: number;
  private examHooks: ExamHooks | null = null;
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
    this.endedExamRetentionMs = options.endedExamRetentionMs ?? EXAM_ENDED_RETENTION_MS;
    this.randomIndex = options.randomIndex ?? ((exclusiveMax) => randomInt(exclusiveMax));
    this.random = options.random ?? createCryptoRandomSource();
    this.analyticsThrottleMs = options.analyticsThrottleMs ?? ANALYTICS_THROTTLE_MS;
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
        'Approve at least one question before starting a live session',
      );
    }

    const questions = this.shuffle(approvedQuestions);
    const questionIds = questions.map((question) => question.id);
    const stored = splitStoredBranding(quiz.settings);
    const parsedSettings = quizSettingsSchema.safeParse(stored.settings);
    const settings: QuizSettings = parsedSettings.success
      ? parsedSettings.data
      : {
          mode: 'live',
          adaptive: false,
          accessMode: 'open',
          adaptiveRounds: undefined,
          durationMinutes: undefined,
        };
    const examDurationMinutes =
      settings.mode === 'exam' && settings.durationMinutes !== undefined
        ? settings.durationMinutes
        : null;
    const adaptiveRounds =
      examDurationMinutes === null && settings.adaptive
        ? resolveAdaptiveRounds(settings.adaptiveRounds, questions.length)
        : null;

    for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
      const joinCode = generateJoinCode(this.randomIndex);
      if (this.sessionIdByJoinCode.has(joinCode)) {
        continue;
      }
      const record = await this.repository.createSession({
        quizId: quiz.id,
        joinCode,
        questionIds,
        examDurationMinutes,
      });
      if (!record) {
        continue;
      }
      const state: SessionState = {
        record,
        hostId: input.hostId,
        durationMs:
          examDurationMinutes === null ? input.questionDurationMs : examDurationMinutes * 60_000,
        questions,
        adaptiveRounds,
        totalRounds: adaptiveRounds ?? questions.length,
        persistence: Promise.resolve(),
        analytics: new SessionAnalytics({
          sessionId: record.id,
          adaptive: adaptiveRounds !== null,
          totalRounds: examDurationMinutes === null ? (adaptiveRounds ?? questions.length) : null,
          mode: examDurationMinutes === null ? 'live' : 'exam',
        }),
        analyticsTimer: null,
        exam: examDurationMinutes === null ? null : { durationMs: examDurationMinutes * 60_000 },
        quizTitle: quiz.title,
        branding: stored.branding,
        accessMode: settings.accessMode,
        roster: new SessionRoster(),
        resultsReleasedAtMs: null,
        finishing: false,
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
      adaptive: false,
      mode: stored.session.exam_duration_minutes === null ? 'live' : 'exam',
      questionDurationSeconds: null,
      questionCount: stored.session.question_ids.length,
      currentQuestionNumber: null,
      participantCount: 0,
    };
  }

  async startSession(
    sessionId: string,
    hostId: string,
    options: { proctored?: boolean } = {},
  ): Promise<SessionSummary> {
    const state = this.requireHostedSession(sessionId, hostId);
    if (state.record.status !== 'lobby') {
      throw new EngineError('invalid_session_state', 'The session has already started');
    }
    state.questions = await this.reloadApprovedQuestions(state);
    if (state.record.status !== 'lobby') {
      throw new EngineError('invalid_session_state', 'The session has already started');
    }
    for (const question of state.questions) {
      state.analytics.registerTopic(question.topic);
    }
    if (state.exam) {
      this.registerExamQuestions(state);
    }
    const startedAtIso = new Date(this.now()).toISOString();
    const proctored = options.proctored ?? state.exam !== null;
    await this.repository.updateSession(state.record.id, {
      status: 'running',
      started_at: startedAtIso,
      proctored,
    });
    state.record = { ...state.record, status: 'running', started_at: startedAtIso, proctored };
    state.analytics.setProctored(proctored);
    if (state.exam) {
      this.pushRoomStateToParticipants(state);
      this.flushHostState(state);
      return this.summarize(state);
    }
    this.pushRoomStateToParticipants(state);
    await this.showRound(state, 0);
    return this.summarize(state);
  }

  async nextQuestion(sessionId: string, hostId: string): Promise<SessionSummary> {
    const state = this.requireHostedSession(sessionId, hostId);
    if (state.exam || state.record.status !== 'running' || !state.run) {
      throw new EngineError('invalid_session_state', 'The session is not running');
    }
    if (!state.run.closed) {
      throw new EngineError('question_still_open', 'The current question is still open');
    }
    const nextIndex = state.run.index + 1;
    if (nextIndex >= state.totalRounds) {
      await this.finishSession(state);
    } else {
      await this.showRound(state, nextIndex);
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

  async joinStudent(
    payload: StudentJoinPayload,
    options: {
      userId?: string | null;
      source?: string;
      userAgent?: string | undefined;
      client?: ClientHints | undefined;
    } = {},
  ): Promise<RoomJoinAck> {
    const result = await this.joinStudentCore(payload, options);
    if (result.ok && result.role === 'student') {
      await this.recordDevice(
        result.participantId,
        parseUserAgent(options.userAgent, options.client ?? payload.client),
      );
    }
    return result;
  }

  private async recordDevice(participantId: string, device: DeviceInfo): Promise<void> {
    const state = this.findStateByParticipant(participantId);
    const participant = state?.participants.get(participantId);
    if (!state || !participant || participant.devices.some((known) => sameDevice(known, device))) {
      return;
    }
    participant.devices = [...participant.devices, device].slice(-MAX_DEVICES_PER_STUDENT);
    state.analytics.setDevices(participantId, participant.devices);
    this.requestHostRefresh(state);
    try {
      await this.repository.updateParticipantDevices(participantId, participant.devices);
    } catch (error) {
      console.error('Saving the participant device failed', error);
    }
  }

  private async joinStudentCore(
    payload: StudentJoinPayload,
    options: { userId?: string | null; source?: string },
  ): Promise<RoomJoinAck> {
    const sessionId = this.sessionIdByJoinCode.get(payload.joinCode);
    const state = sessionId ? this.sessionsById.get(sessionId) : undefined;
    if (!state) {
      return { ok: false, error: 'session_not_found' };
    }

    if (state.accessMode === 'token') {
      return this.joinWithAccessToken(state, payload, options);
    }
    if (payload.accessToken !== undefined || payload.displayName === undefined) {
      return { ok: false, error: 'invalid_access_token' };
    }

    const displayName = payload.displayName;
    const nameKey = displayName.toLowerCase();
    const existingId = state.participantIdByName.get(nameKey);
    const existing = existingId ? state.participants.get(existingId) : undefined;

    if (payload.rejoinToken !== undefined) {
      const candidateHash = hashRejoinToken(payload.rejoinToken);
      if (existing && tokenHashesMatch(candidateHash, existing.tokenHash)) {
        return {
          ok: true,
          role: 'student',
          sessionId: state.record.id,
          participantId: existing.id,
          displayName: existing.displayName,
          rejoinToken: payload.rejoinToken,
        };
      }
      if (!existing || !this.isRejoinOpen(existing)) {
        return { ok: false, error: 'invalid_rejoin_token' };
      }
      return this.claimSeat(state, existing);
    }

    if (existing && this.isRejoinOpen(existing)) {
      return this.claimSeat(state, existing);
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
    try {
      return await this.seatNewParticipant(state, displayName, options.userId ?? null);
    } finally {
      state.reservedNames.delete(nameKey);
    }
  }

  private isRejoinOpen(participant: ParticipantState): boolean {
    return participant.rejoinOpenUntilMs !== null && participant.rejoinOpenUntilMs > this.now();
  }

  private async seatNewParticipant(
    state: SessionState,
    displayName: string,
    userId: string | null,
  ): Promise<RoomJoinAck> {
    const rejoinToken = randomBytes(32).toString('hex');
    const inserted = await this.repository.insertParticipant({
      sessionId: state.record.id,
      displayName,
      rejoinTokenHash: hashRejoinToken(rejoinToken),
      userId,
    });
    if (inserted === 'name_taken') {
      return { ok: false, error: 'name_taken' };
    }
    const participant: ParticipantState = {
      id: inserted.id,
      displayName: inserted.display_name,
      joinedAtMs: Date.parse(inserted.joined_at),
      tokenHash: hashRejoinToken(rejoinToken),
      userId,
      connected: false,
      rejoinOpenUntilMs: null,
      devices: [],
      score: 0,
      totalResponseMs: 0,
      elo: Number.isFinite(inserted.elo) ? inserted.elo : INITIAL_PLAYER_RATING,
      answers: new Map(),
      servedQuestionIds: new Set(),
      mastery: new Map(),
      lastOutcome: null,
    };
    state.participants.set(participant.id, participant);
    state.analytics.registerParticipant(participant.id, participant.displayName);
    state.analytics.setRating(participant.id, participant.elo);
    state.participantIdByName.set(displayName.toLowerCase(), participant.id);
    this.sessionIdByParticipantId.set(participant.id, state.record.id);
    this.requestHostRefresh(state);
    return {
      ok: true,
      role: 'student',
      sessionId: state.record.id,
      participantId: participant.id,
      displayName: participant.displayName,
      rejoinToken,
    };
  }

  private async claimSeat(
    state: SessionState,
    participant: ParticipantState,
  ): Promise<RoomJoinAck> {
    const rejoinToken = randomBytes(32).toString('hex');
    const tokenHash = hashRejoinToken(rejoinToken);
    await this.repository.updateParticipantTokenHash(participant.id, tokenHash);
    participant.tokenHash = tokenHash;
    participant.rejoinOpenUntilMs = null;
    return {
      ok: true,
      role: 'student',
      sessionId: state.record.id,
      participantId: participant.id,
      displayName: participant.displayName,
      rejoinToken,
    };
  }

  private async joinWithAccessToken(
    state: SessionState,
    payload: StudentJoinPayload,
    options: { userId?: string | null; source?: string },
  ): Promise<RoomJoinAck> {
    if (payload.accessToken === undefined) {
      return { ok: false, error: 'access_token_required' };
    }
    const nowMs = this.now();
    const source = options.source ?? 'unknown';
    if (state.roster.isThrottled(source, nowMs)) {
      return { ok: false, error: 'rate_limited' };
    }
    const item = state.roster.findByTokenHash(
      hashRejoinToken(normalizeAccessToken(payload.accessToken)),
    );
    if (!item) {
      state.roster.noteFailure(source, nowMs);
      return { ok: false, error: 'invalid_access_token' };
    }
    while (item.seating) {
      await item.seating.catch(() => undefined);
    }
    if (item.participantId) {
      return this.resumeRosterSeat(state, item);
    }
    if (state.record.status === 'ended') {
      return { ok: false, error: 'session_ended' };
    }
    if (state.record.status !== 'lobby' && !state.exam) {
      return { ok: false, error: 'session_started' };
    }
    let result: RoomJoinAck = { ok: false, error: 'server_error' };
    item.seating = (async () => {
      result = await this.seatNewParticipant(state, item.displayName, options.userId ?? null);
      if (result.ok && result.role === 'student') {
        item.participantId = result.participantId;
        await this.repository.updateRosterEntry(item.id, { participantId: result.participantId });
      }
    })();
    try {
      await item.seating;
    } finally {
      item.seating = null;
    }
    return result;
  }

  private async resumeRosterSeat(state: SessionState, item: RosterItem): Promise<RoomJoinAck> {
    const participant = item.participantId ? state.participants.get(item.participantId) : undefined;
    if (!participant) {
      return { ok: false, error: 'invalid_access_token' };
    }
    if (participant.connected) {
      item.openedElsewhere += 1;
      this.requestHostRefresh(state);
    }
    return this.claimSeat(state, participant);
  }

  async addRoster(
    sessionId: string,
    hostId: string,
    students: RosterStudentInput[],
  ): Promise<RosterAddResponse> {
    const state = this.requireTokenSession(sessionId, hostId);
    const seen = new Set<string>();
    for (const student of students) {
      const key = student.displayName.toLowerCase();
      if (seen.has(key) || state.roster.hasName(student.displayName)) {
        throw new EngineError('roster_name_taken', `${student.displayName} is already on the list`);
      }
      seen.add(key);
    }
    const tokens = students.map(() => generateAccessToken((max) => randomInt(max)));
    const created = await this.repository.insertRoster(
      students.map((student, index) => ({
        sessionId: state.record.id,
        displayName: student.displayName,
        email: student.email ?? null,
        tokenHash: hashRejoinToken(tokens[index] ?? ''),
      })),
    );
    if (created === 'name_taken') {
      throw new EngineError('roster_name_taken', 'A name on the list is already used');
    }
    const issued = created.map((record, index) => {
      const item = state.roster.add(record);
      item.issuedToken = formatAccessToken(tokens[index] ?? '');
      return {
        rosterId: record.id,
        displayName: record.displayName,
        email: record.email,
        token: formatAccessToken(tokens[index] ?? ''),
      };
    });
    return { entries: this.rosterEntries(state), issued };
  }

  listRoster(sessionId: string, hostId: string): RosterEntry[] {
    const state = this.sessionsById.get(sessionId);
    if (!state) {
      throw new EngineError('session_not_found', 'Session not found');
    }
    this.assertHost(state, hostId);
    return this.rosterEntries(state);
  }

  prepareTokenEmails(
    sessionId: string,
    hostId: string,
    rosterIds?: string[],
  ): {
    quizTitle: string;
    brand: { institutionName?: string; logoUrl?: string; brandColor?: string };
    joinCode: string;
    items: { rosterId: string; displayName: string; email: string; token: string }[];
    skipped: { rosterId: string; reason: 'no_email' | 'no_token' }[];
  } {
    const state = this.requireTokenSession(sessionId, hostId);
    const items: { rosterId: string; displayName: string; email: string; token: string }[] = [];
    const skipped: { rosterId: string; reason: 'no_email' | 'no_token' }[] = [];
    for (const rosterId of rosterIds ?? state.roster.list().map((entry) => entry.id)) {
      const item = state.roster.get(rosterId);
      if (!item) {
        skipped.push({ rosterId, reason: 'no_token' });
      } else if (!item.email) {
        skipped.push({ rosterId, reason: 'no_email' });
      } else if (!item.issuedToken) {
        skipped.push({ rosterId, reason: 'no_token' });
      } else {
        items.push({
          rosterId,
          displayName: item.displayName,
          email: item.email,
          token: item.issuedToken,
        });
      }
    }
    return {
      quizTitle: state.quizTitle,
      brand: {
        ...(state.branding?.institutionName
          ? { institutionName: state.branding.institutionName }
          : {}),
        ...(state.branding?.logoUrl ? { logoUrl: state.branding.logoUrl } : {}),
        ...(state.branding?.brandColor ? { brandColor: state.branding.brandColor } : {}),
      },
      joinCode: state.record.join_code,
      items,
      skipped,
    };
  }

  async reissueRosterToken(
    sessionId: string,
    hostId: string,
    rosterId: string,
  ): Promise<RosterReissueResponse> {
    const state = this.requireTokenSession(sessionId, hostId);
    const item = state.roster.get(rosterId);
    if (!item) {
      throw new EngineError('roster_entry_not_found', 'Student not found on the list');
    }
    const token = generateAccessToken((max) => randomInt(max));
    const tokenHash = hashRejoinToken(token);
    await this.repository.updateRosterEntry(item.id, { tokenHash });
    state.roster.replaceTokenHash(item.id, tokenHash);
    item.issuedToken = formatAccessToken(token);
    return {
      issued: {
        rosterId: item.id,
        displayName: item.displayName,
        email: item.email,
        token: formatAccessToken(token),
      },
    };
  }

  async removeRosterEntry(sessionId: string, hostId: string, rosterId: string): Promise<void> {
    const state = this.requireTokenSession(sessionId, hostId);
    const item = state.roster.get(rosterId);
    if (!item) {
      throw new EngineError('roster_entry_not_found', 'Student not found on the list');
    }
    if (item.participantId) {
      throw new EngineError('roster_entry_in_use', 'This student has already joined');
    }
    item.issuedToken = null;
    await this.repository.deleteRosterEntry(item.id);
    state.roster.remove(item.id);
  }

  allowRejoin(sessionId: string, hostId: string, participantId: string): AllowRejoinResponse {
    const state = this.requireHostedSession(sessionId, hostId);
    const participant = state.participants.get(participantId);
    if (!participant) {
      throw new EngineError('participant_not_found', 'Student not found');
    }
    if (state.record.status === 'ended') {
      throw new EngineError('invalid_session_state', 'The session has ended');
    }
    participant.rejoinOpenUntilMs = this.now() + REJOIN_WINDOW_MS;
    return { expiresAtMs: participant.rejoinOpenUntilMs };
  }

  private requireTokenSession(sessionId: string, hostId: string): SessionState {
    const state = this.requireHostedSession(sessionId, hostId);
    if (state.accessMode !== 'token') {
      throw new EngineError(
        'roster_not_enabled',
        'This session is not restricted to invited students',
      );
    }
    if (state.record.status === 'ended') {
      throw new EngineError('invalid_session_state', 'The session has ended');
    }
    return state;
  }

  private rosterEntries(state: SessionState): RosterEntry[] {
    return state.roster.list().map((item) => ({
      id: item.id,
      emailable: Boolean(item.email && item.issuedToken),
      displayName: item.displayName,
      email: item.email,
      participantId: item.participantId,
      connected: item.participantId
        ? (state.participants.get(item.participantId)?.connected ?? false)
        : false,
      openedElsewhere: item.openedElsewhere,
    }));
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
    const question = run.assignments.get(participantId);
    if (!question) {
      return { ok: false, error: 'no_active_question' };
    }
    if (question.id !== payload.questionId) {
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
    if (participant.answers.has(question.id)) {
      return { ok: false, error: 'already_answered' };
    }

    const correct = payload.chosenIndex === question.correctIndex;
    const responseMs = Math.round(
      clampResponseMs(receivedAtMs - run.startsAtServerMs, run.durationMs),
    );
    const points = computePoints({ correct, responseMs, durationMs: run.durationMs });
    const record: AnswerRecord = {
      chosenIndex: payload.chosenIndex,
      correct,
      points,
      responseMs,
      answeredAtMs: receivedAtMs,
    };

    participant.answers.set(question.id, record);
    participant.score += points;
    participant.totalResponseMs += responseMs;
    this.adjustOptionCount(run, payload.chosenIndex, 1);

    try {
      await this.repository.insertResponse({
        sessionId: state.record.id,
        participantId,
        questionId: question.id,
        chosenIndex: payload.chosenIndex,
        correct,
        responseMs,
        points,
        servedAtIso: new Date(run.startsAtServerMs).toISOString(),
        answeredAtIso: new Date(receivedAtMs).toISOString(),
      });
    } catch (error) {
      console.error(error);
      participant.answers.delete(question.id);
      participant.score -= points;
      participant.totalResponseMs -= responseMs;
      this.adjustOptionCount(run, payload.chosenIndex, -1);
      return { ok: false, error: 'server_error' };
    }

    state.analytics.onResponse({
      participantId,
      questionId: question.id,
      round: run.index + 1,
      correct,
      points,
      responseMs,
      durationMs: run.durationMs,
    });
    this.requestHostRefresh(state);
    this.requestAnalyticsEmit(state);
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

  async settlePersistence(): Promise<void> {
    await Promise.all([...this.sessionsById.values()].map((state) => state.persistence));
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

  private async reloadApprovedQuestions(state: SessionState): Promise<LiveQuestion[]> {
    const questionIds = state.record.question_ids;
    const loaded = await this.repository.loadQuestionsByIds(questionIds);
    const loadedById = new Map(loaded.map((question) => [question.id, question]));
    const ordered: LiveQuestion[] = [];
    for (const questionId of questionIds) {
      const question = loadedById.get(questionId);
      if (!question || !question.approved) {
        throw new EngineError(
          'questions_not_approved',
          'Every question in the session must still be approved before it can start',
        );
      }
      ordered.push({
        id: question.id,
        stem: question.stem,
        options: question.options,
        correctIndex: question.correctIndex,
        topic: question.topic,
        difficulty: question.difficulty,
        eloRating: question.eloRating,
        answersCount: question.answersCount,
      });
    }
    return ordered;
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
      adaptive: state.adaptiveRounds !== null,
      mode: state.exam ? 'exam' : 'live',
      questionDurationSeconds: Math.round(state.durationMs / 1000),
      questionCount: state.totalRounds,
      currentQuestionNumber: state.run ? state.run.index + 1 : null,
      participantCount: state.participants.size,
    };
  }

  private adjustOptionCount(run: QuestionRun, optionIndex: number, change: number) {
    if (run.optionCounts) {
      run.optionCounts[optionIndex] = Math.max((run.optionCounts[optionIndex] ?? 0) + change, 0);
    }
  }

  private pickAdaptiveQuestion(state: SessionState, participant: ParticipantState) {
    const pool = state.questions.map((question) => ({
      id: question.id,
      rating: question.eloRating,
      question,
    }));
    return (
      selectNextAdaptiveQuestion(pool, participant.servedQuestionIds, participant.elo, this.random)
        ?.question ?? null
    );
  }

  private async showRound(state: SessionState, index: number) {
    const assignments = new Map<string, LiveQuestion>();
    let sharedQuestion: LiveQuestion | null = null;

    if (state.adaptiveRounds === null) {
      sharedQuestion = state.questions[index] ?? null;
      if (!sharedQuestion) {
        return;
      }
      for (const participant of state.participants.values()) {
        assignments.set(participant.id, sharedQuestion);
      }
    } else {
      const inJoinOrder = [...state.participants.values()].sort(
        (first, second) =>
          first.joinedAtMs - second.joinedAtMs || first.id.localeCompare(second.id),
      );
      for (const participant of inJoinOrder) {
        const picked = this.pickAdaptiveQuestion(state, participant);
        if (picked) {
          participant.servedQuestionIds.add(picked.id);
          assignments.set(participant.id, picked);
        }
      }
      if (assignments.size === 0) {
        await this.finishSession(state);
        return;
      }
    }

    const run: QuestionRun = {
      index,
      assignments,
      sharedQuestion,
      startsAtServerMs: this.now() + this.startDelayMs,
      durationMs: state.durationMs,
      closed: false,
      optionCounts:
        state.adaptiveRounds === null ? new Array<number>(QUESTION_OPTION_COUNT).fill(0) : null,
      closeTimer: null,
    };
    state.run = run;
    state.lastResult = null;
    state.analytics.onRoundStart(index + 1);
    for (const question of new Set(assignments.values())) {
      state.analytics.onQuestionServed(
        {
          id: question.id,
          stem: question.stem,
          topic: question.topic,
          difficulty: question.difficulty,
          answersCount: question.answersCount,
        },
        index + 1,
      );
    }

    if (sharedQuestion) {
      this.publisher.emitToSession(state.record.id, 'question:show', {
        questionId: sharedQuestion.id,
        stem: sharedQuestion.stem,
        options: sharedQuestion.options,
        startsAtServerMs: run.startsAtServerMs,
        durationMs: run.durationMs,
      });
    } else {
      for (const [participantId, question] of assignments) {
        this.publisher.emitToParticipant(participantId, 'question:show', {
          questionId: question.id,
          stem: question.stem,
          options: question.options,
          startsAtServerMs: run.startsAtServerMs,
          durationMs: run.durationMs,
        });
      }
    }
    this.flushHostState(state);
    this.emitAnalytics(state);
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
    const connectedAssigned = [...state.participants.values()].filter(
      (participant) => participant.connected && run.assignments.has(participant.id),
    );
    if (connectedAssigned.length === 0) {
      return;
    }
    if (
      connectedAssigned.every((participant) =>
        participant.answers.has(run.assignments.get(participant.id)?.id ?? ''),
      )
    ) {
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

  private applyRatingUpdates(state: SessionState, run: QuestionRun): RatingJob[] {
    const answered: {
      participant: ParticipantState;
      question: LiveQuestion;
      answer: AnswerRecord;
    }[] = [];
    for (const [participantId, question] of run.assignments) {
      const participant = state.participants.get(participantId);
      if (!participant) {
        continue;
      }
      const answer = participant.answers.get(question.id);
      participant.lastOutcome = {
        difficulty: question.difficulty,
        correct: answer?.correct ?? false,
      };
      if (answer) {
        answered.push({ participant, question, answer });
      }
    }
    answered.sort(
      (first, second) =>
        first.answer.answeredAtMs - second.answer.answeredAtMs ||
        first.participant.id.localeCompare(second.participant.id),
    );

    const questionRatingSnapshot = new Map<string, number>();
    for (const { question } of answered) {
      if (!questionRatingSnapshot.has(question.id)) {
        questionRatingSnapshot.set(question.id, question.eloRating);
      }
    }

    const jobs: RatingJob[] = [];
    for (const { participant, question, answer } of answered) {
      const questionEloBefore = questionRatingSnapshot.get(question.id) ?? question.eloRating;
      const participantEloBefore = participant.elo;
      const update = updateRatings({
        playerRating: participantEloBefore,
        questionRating: questionEloBefore,
        correct: answer.correct,
        responseMs: answer.responseMs,
        durationMs: run.durationMs,
      });
      const questionDelta = update.questionRating - questionEloBefore;
      participant.elo = update.playerRating;
      question.eloRating = clampRating(question.eloRating + questionDelta);

      const topicKey = normalizeTopicKey(question.topic);
      const masteryAfter = bktUpdate(
        participant.mastery.get(topicKey) ?? DEFAULT_BKT_PARAMS.pInit,
        answer.correct,
      );
      participant.mastery.set(topicKey, masteryAfter);
      question.answersCount += 1;
      state.analytics.setQuestionAnswersCount(question.id, question.answersCount);
      state.analytics.onMastery(participant.id, question.topic, masteryAfter);
      state.analytics.setRating(participant.id, update.playerRating);

      jobs.push({
        question,
        participantId: participant.id,
        topicKey,
        participantEloBefore,
        participantEloAfter: update.playerRating,
        questionEloBefore,
        questionDelta,
        masteryAfter,
      });
    }
    return jobs;
  }

  private enqueueRatingPersistence(state: SessionState, jobs: RatingJob[]) {
    for (const job of jobs) {
      state.persistence = state.persistence.then(async () => {
        try {
          await this.repository.recordResponseRatings({
            participantId: job.participantId,
            questionId: job.question.id,
            participantEloBefore: job.participantEloBefore,
            questionEloBefore: job.questionEloBefore,
          });
          await this.repository.applyQuestionRatingDelta(job.question.id, job.questionDelta);
          await this.repository.updateParticipantElo(job.participantId, job.participantEloAfter);
          await this.repository.upsertKnowledgeState({
            participantId: job.participantId,
            topic: job.topicKey,
            pMastery: job.masteryAfter,
          });
        } catch (error) {
          console.error('Rating persistence failed', error);
        }
      });
    }
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

    const ratingJobs = this.applyRatingUpdates(state, run);
    state.analytics.onRoundClose(run.index + 1);

    const ranked = this.rankParticipants(state);
    const rankById = new Map(ranked.map((participant, position) => [participant.id, position + 1]));
    const entries = this.buildLeaderboard(ranked);
    const optionCounts = run.optionCounts ? [...run.optionCounts] : null;

    const perParticipant = new Map<string, QuestionResultPayload>();
    for (const participant of ranked) {
      const question = run.assignments.get(participant.id);
      if (!question) {
        continue;
      }
      const answer = participant.answers.get(question.id);
      const you: YourQuestionResult = {
        chosenIndex: answer?.chosenIndex ?? null,
        correct: answer?.correct ?? false,
        pointsAwarded: answer?.points ?? 0,
        totalPoints: participant.score,
        rank: rankById.get(participant.id) ?? ranked.length,
      };
      perParticipant.set(participant.id, {
        questionId: question.id,
        correctIndex: question.correctIndex,
        optionCounts,
        you,
      });
    }
    const hostResult: QuestionResultPayload | null = run.sharedQuestion
      ? {
          questionId: run.sharedQuestion.id,
          correctIndex: run.sharedQuestion.correctIndex,
          optionCounts,
          you: null,
        }
      : null;
    state.lastResult = { hostResult, perParticipant };

    if (hostResult) {
      this.publisher.emitToHost(state.record.id, 'question:result', hostResult);
    }
    this.publisher.emitToHost(state.record.id, 'leaderboard:update', { entries, you: null });
    for (const participant of ranked) {
      const personal = perParticipant.get(participant.id);
      if (personal) {
        this.publisher.emitToParticipant(participant.id, 'question:result', personal);
      }
      this.publisher.emitToParticipant(participant.id, 'leaderboard:update', {
        entries,
        you: { rank: rankById.get(participant.id) ?? ranked.length, score: participant.score },
      });
    }
    this.enqueueRatingPersistence(state, ratingJobs);
    this.flushHostState(state);
    this.emitAnalytics(state);
  }

  private hasEnded(state: SessionState): boolean {
    return state.record.status === 'ended';
  }

  private async finishSession(state: SessionState) {
    if (state.record.status === 'ended' || state.finishing) {
      return;
    }
    state.finishing = true;
    if (state.run && !state.run.closed) {
      state.run.closed = true;
    }
    this.clearTimers(state);
    await state.persistence;
    if (state.exam) {
      await this.examHooks?.beforeSessionEnds(state.record.id);
    }
    if (this.hasEnded(state)) {
      return;
    }

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
        entries: state.exam ? [] : entries,
        you: state.exam ? null : { rank: position + 1, score: participant.score },
      });
    });
    this.flushHostState(state);
    const finalSnapshot = this.buildAnalyticsSnapshot(state, true);
    this.clearAnalyticsTimer(state);
    this.publisher.emitToHost(sessionId, 'analytics:snapshot', finalSnapshot);

    state.retentionTimer = setTimeout(
      () => this.forgetSession(state),
      state.exam ? this.endedExamRetentionMs : this.endedSessionRetentionMs,
    );
    state.retentionTimer.unref();

    await this.repository.updateSession(sessionId, { status: 'ended', ended_at: endedAtIso });
    try {
      await this.repository.saveSessionSummary(sessionId, finalSnapshot, endedAtIso);
    } catch (error) {
      console.error('Saving the session summary failed', error);
    }
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
    this.clearAnalyticsTimer(state);
    if (state.retentionTimer) {
      clearTimeout(state.retentionTimer);
      state.retentionTimer = null;
    }
  }

  private buildAnalyticsSnapshot(state: SessionState, includeMedians: boolean): AnalyticsSnapshot {
    const ranked = this.rankParticipants(state);
    return state.analytics.buildSnapshot({
      status: state.record.status,
      generatedAtMs: this.now(),
      ranks: ranked.map((participant, position) => ({
        participantId: participant.id,
        rank: position + 1,
      })),
      leaderboard: this.buildLeaderboard(ranked),
      includeMedians,
    });
  }

  private clearAnalyticsTimer(state: SessionState) {
    if (state.analyticsTimer) {
      clearTimeout(state.analyticsTimer);
      state.analyticsTimer = null;
    }
  }

  private emitAnalytics(state: SessionState) {
    this.clearAnalyticsTimer(state);
    this.publisher.emitToHost(
      state.record.id,
      'analytics:snapshot',
      this.buildAnalyticsSnapshot(state, state.record.status === 'ended'),
    );
  }

  private requestAnalyticsEmit(state: SessionState) {
    if (state.analyticsTimer || state.record.status === 'ended') {
      return;
    }
    state.analyticsTimer = setTimeout(() => {
      state.analyticsTimer = null;
      this.emitAnalytics(state);
    }, this.analyticsThrottleMs);
    state.analyticsTimer.unref();
  }

  getAnalyticsSnapshot(sessionId: string, includeMedians = false): AnalyticsSnapshot | null {
    const state = this.sessionsById.get(sessionId);
    if (!state || (state.exam && state.record.status !== 'ended')) {
      return null;
    }
    return this.buildAnalyticsSnapshot(state, includeMedians);
  }

  attachExam(hooks: ExamHooks) {
    this.examHooks = hooks;
  }

  getExamContext(sessionId: string): ExamContext | null {
    const state = this.sessionsById.get(sessionId);
    if (!state?.exam) {
      return null;
    }
    return {
      sessionId,
      status: state.record.status,
      hostId: state.hostId,
      durationMs: state.exam.durationMs,
      questions: state.questions,
      resultsReleasedAtMs: state.resultsReleasedAtMs,
    };
  }

  getJoinInfo(joinCode: string): JoinInfo | null {
    const sessionId = this.sessionIdByJoinCode.get(joinCode.toUpperCase());
    const state = sessionId ? this.sessionsById.get(sessionId) : undefined;
    if (!state) {
      return null;
    }
    return {
      quizTitle: state.quizTitle,
      branding: state.branding,
      assessmentType: state.exam ? 'exam' : state.adaptiveRounds !== null ? 'adaptive' : 'live',
      accessMode: state.accessMode,
      durationMinutes: state.exam ? Math.round(state.exam.durationMs / 60_000) : null,
      status: state.record.status,
    };
  }

  getProctorInfo(
    sessionId: string,
  ): { proctored: boolean; status: SessionStatus; exam: boolean } | null {
    const state = this.sessionsById.get(sessionId);
    return state
      ? {
          proctored: state.record.proctored,
          status: state.record.status,
          exam: state.exam !== null,
        }
      : null;
  }

  getSessionStatus(sessionId: string): SessionStatus | null {
    return this.sessionsById.get(sessionId)?.record.status ?? null;
  }

  getParticipantRef(participantId: string): { sessionId: string; displayName: string } | null {
    const state = this.findStateByParticipant(participantId);
    const participant = state?.participants.get(participantId);
    return state && participant
      ? { sessionId: state.record.id, displayName: participant.displayName }
      : null;
  }

  listSessionParticipants(sessionId: string): { id: string; displayName: string }[] {
    const state = this.sessionsById.get(sessionId);
    return [...(state?.participants.values() ?? [])].map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
    }));
  }

  getSessionAnalytics(sessionId: string): SessionAnalytics | null {
    return this.sessionsById.get(sessionId)?.analytics ?? null;
  }

  markResultsReleased(sessionId: string, releasedAtMs: number) {
    const state = this.sessionsById.get(sessionId);
    if (state && state.resultsReleasedAtMs === null) {
      state.resultsReleasedAtMs = releasedAtMs;
      this.flushHostState(state);
    }
  }

  applyExamResult(participantId: string, score: number, totalResponseMs: number) {
    const participant = this.findStateByParticipant(participantId)?.participants.get(participantId);
    if (participant) {
      participant.score = score;
      participant.totalResponseMs = totalResponseMs;
    }
  }

  private registerExamQuestions(state: SessionState) {
    state.questions.forEach((question, index) => {
      state.analytics.onQuestionServed(
        {
          id: question.id,
          stem: question.stem,
          topic: question.topic,
          difficulty: question.difficulty,
          answersCount: question.answersCount,
        },
        index + 1,
      );
    });
  }

  private pushRoomStateToParticipants(state: SessionState) {
    for (const participant of state.participants.values()) {
      this.publisher.emitToParticipant(
        participant.id,
        'room:state',
        this.buildRoomState(state, { role: 'student', participantId: participant.id }),
      );
    }
  }

  async rehydrateExamSessions(): Promise<void> {
    const open = await this.repository.listOpenExamSessions();
    for (const entry of open) {
      const { session } = entry;
      const minutes = session.exam_duration_minutes;
      if (minutes === null || this.sessionsById.has(session.id)) {
        continue;
      }
      const loaded = await this.repository.loadQuestionsByIds(session.question_ids);
      const loadedById = new Map(loaded.map((question) => [question.id, question]));
      const questions: LiveQuestion[] = session.question_ids.flatMap((questionId) => {
        const question = loadedById.get(questionId);
        return question
          ? [
              {
                id: question.id,
                stem: question.stem,
                options: question.options,
                correctIndex: question.correctIndex,
                topic: question.topic,
                difficulty: question.difficulty,
                eloRating: question.eloRating,
                answersCount: question.answersCount,
              },
            ]
          : [];
      });

      const state: SessionState = {
        record: session,
        hostId: entry.hostId,
        durationMs: minutes * 60_000,
        questions,
        adaptiveRounds: null,
        totalRounds: questions.length,
        persistence: Promise.resolve(),
        analytics: new SessionAnalytics({
          sessionId: session.id,
          adaptive: false,
          totalRounds: null,
          mode: 'exam',
        }),
        analyticsTimer: null,
        exam: { durationMs: minutes * 60_000 },
        quizTitle: entry.quizTitle,
        branding: splitStoredBranding(entry.quizSettings).branding,
        accessMode: accessModeOf(entry.quizSettings),
        roster: SessionRoster.from(await this.repository.listRoster(session.id)),
        resultsReleasedAtMs: session.results_released_at
          ? Date.parse(session.results_released_at)
          : null,
        finishing: false,
        participants: new Map(),
        participantIdByName: new Map(),
        reservedNames: new Set(),
        run: null,
        lastResult: null,
        hostRefreshTimer: null,
        retentionTimer: null,
      };
      for (const participant of entry.participants) {
        state.participants.set(participant.id, {
          id: participant.id,
          displayName: participant.displayName,
          joinedAtMs: participant.joinedAtMs,
          tokenHash: participant.tokenHash,
          userId: null,
          connected: false,
          rejoinOpenUntilMs: null,
          devices: participant.devices,
          score: 0,
          totalResponseMs: 0,
          elo: participant.elo,
          answers: new Map(),
          servedQuestionIds: new Set(),
          mastery: new Map(),
          lastOutcome: null,
        });
        state.participantIdByName.set(participant.displayName.toLowerCase(), participant.id);
        state.analytics.registerParticipant(participant.id, participant.displayName);
        state.analytics.setDevices(participant.id, participant.devices);
        this.sessionIdByParticipantId.set(participant.id, session.id);
      }
      state.analytics.setProctored(session.proctored);
      for (const question of questions) {
        state.analytics.registerTopic(question.topic);
      }
      this.registerExamQuestions(state);
      this.sessionsById.set(session.id, state);
      this.sessionIdByJoinCode.set(session.join_code, session.id);
      await this.examHooks?.loadRehydrated(session.id);
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

  private buildAdaptiveTable(state: SessionState): AdaptiveRow[] {
    return [...state.participants.values()]
      .sort((first, second) => first.joinedAtMs - second.joinedAtMs)
      .map((participant) => ({
        participantId: participant.id,
        displayName: participant.displayName,
        rating: participant.elo,
        lastDifficulty: participant.lastOutcome?.difficulty ?? null,
        lastCorrect: participant.lastOutcome?.correct ?? null,
      }));
  }

  private buildRoomState(state: SessionState, viewer: RoomViewer): RoomStatePayload {
    const run = state.record.status === 'ended' ? null : state.run;
    const ranked = this.rankParticipants(state);
    const status: SessionStatus = state.record.status;
    const adaptive = state.adaptiveRounds !== null;
    const isExam = state.exam !== null;

    let you: RoomStatePayload['you'] = null;
    let youAnswered = false;
    let lastResult: QuestionResultPayload | null = null;
    let visibleQuestion: LiveQuestion | null = null;

    if (viewer.role === 'host') {
      visibleQuestion = run?.sharedQuestion ?? null;
      if (state.lastResult && run?.closed) {
        lastResult = state.lastResult.hostResult;
      }
    } else {
      const participant = state.participants.get(viewer.participantId);
      visibleQuestion = run?.assignments.get(viewer.participantId) ?? null;
      if (state.lastResult && run?.closed) {
        lastResult = state.lastResult.perParticipant.get(viewer.participantId) ?? null;
      }
      if (participant) {
        const position = ranked.findIndex((candidate) => candidate.id === participant.id);
        you = {
          participantId: participant.id,
          displayName: participant.displayName,
          score: participant.score,
          rank: position + 1,
        };
        youAnswered = visibleQuestion ? participant.answers.has(visibleQuestion.id) : false;
      }
    }

    const answeredCount =
      viewer.role === 'host' && run
        ? [...state.participants.values()].filter((participant) => {
            const question = run.assignments.get(participant.id);
            return question ? participant.answers.has(question.id) : false;
          }).length
        : null;

    return {
      sessionId: state.record.id,
      joinCode: state.record.join_code,
      quizTitle: state.quizTitle,
      branding: state.branding,
      accessMode: state.accessMode,
      proctored: state.record.proctored,
      startedAtServerMs: state.record.started_at ? Date.parse(state.record.started_at) : null,
      status,
      role: viewer.role,
      serverNowMs: this.now(),
      mode: isExam ? 'exam' : 'live',
      exam:
        isExam && viewer.role === 'student'
          ? (this.examHooks?.studentView(state.record.id, viewer.participantId) ?? null)
          : null,
      examProgress:
        isExam && viewer.role === 'host'
          ? (this.examHooks?.hostProgress(state.record.id) ?? [])
          : null,
      participants:
        isExam && viewer.role === 'student'
          ? []
          : [...state.participants.values()]
              .sort((first, second) => first.joinedAtMs - second.joinedAtMs)
              .map((participant) => ({
                participantId: participant.id,
                displayName: participant.displayName,
                connected: participant.connected,
                devices: viewer.role === 'host' ? participant.devices : [],
              })),
      currentQuestion:
        run && visibleQuestion
          ? {
              questionId: visibleQuestion.id,
              stem: visibleQuestion.stem,
              options: visibleQuestion.options,
              startsAtServerMs: run.startsAtServerMs,
              durationMs: run.durationMs,
              questionNumber: run.index + 1,
              totalQuestions: state.totalRounds,
            }
          : null,
      questionClosed: run?.closed ?? false,
      adaptive,
      round:
        viewer.role === 'host' && adaptive && run
          ? {
              roundNumber: run.index + 1,
              totalRounds: state.totalRounds,
              startsAtServerMs: run.startsAtServerMs,
              durationMs: run.durationMs,
            }
          : null,
      adaptiveTable: viewer.role === 'host' && adaptive ? this.buildAdaptiveTable(state) : null,
      youAnswered,
      answeredCount,
      lastResult,
      leaderboard: isExam ? [] : this.buildLeaderboard(ranked),
      you: isExam ? null : you,
    };
  }
}
