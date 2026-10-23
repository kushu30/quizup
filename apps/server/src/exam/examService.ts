import { randomInt, randomUUID } from 'node:crypto';
import {
  ANSWER_GRACE_MS,
  EXAM_POINTS_PER_QUESTION,
  EXAM_PROGRESS_THROTTLE_MS,
  EXAM_SWEEP_INTERVAL_MS,
  PROCTOR_COUNTED_TYPES,
  PROCTOR_FLUSH_INTERVAL_MS,
  PROCTOR_LATE_AFTER_MS,
  PROCTOR_SERIOUS_TYPES,
  consentVersionFor,
  seriousFlagCount,
  buildAttemptOrders,
  perStudentQuestionCount,
  displayedToOriginalIndex,
  emptyProctorCounts,
  originalToDisplayedIndex,
  type Ack,
  type ExamAnswerPayload,
  type ExamProgressPayload,
  type ExamProgressRow,
  type ExamResultQuestion,
  type ExamResults,
  type ExamStudentView,
  type ExamSubmitReason,
  type MeResponse,
  type ProctorCountedType,
  type ProctorCounts,
  type ProctorEventPayload,
  type ProctorEventRecord,
  type ProctorParticipantTimeline,
  type ProctorRecordType,
  type ProctorSeriousType,
  questionImageOf,
} from '@quizup/shared';
import type { AnalyticsAccess } from '../analytics/analyticsService.js';
import type { LiveEngine } from '../live/engine.js';
import {
  EngineError,
  type ExamAnswerRecord,
  type ExamAttemptRecord,
  type ExamContext,
  type ExamHooks,
  type LivePublisher,
} from '../live/types.js';

export interface ExamServiceOptions {
  engine: LiveEngine;
  publisher: LivePublisher;
  now?: () => number;
  graceMs?: number;
  sweepIntervalMs?: number;
  progressThrottleMs?: number;
  proctorFlushMs?: number;
  randomSeed?: () => number;
}

interface AttemptEntry {
  attempt: ExamAttemptRecord;
  answers: Map<string, ExamAnswerRecord>;
  counts: ProctorCounts;
  dropped: number;
  submitting: Promise<void> | null;
  autoSubmitted: boolean;
  /** Why this service submitted the attempt, once it has. Not restored after a restart. */
  submitReason: ExamSubmitReason | null;
}

type ExamViewResult = Ack<{ view: ExamStudentView }>;

function mayRead(hostId: string, user: MeResponse): boolean {
  return hostId === user.id || user.role === 'admin';
}

const CAMERA_EVENT_TYPES: readonly string[] = [
  'face_missing',
  'multiple_faces',
  'looking_away',
  'camera_blocked',
  'camera_lost',
  'camera_denied',
];
const MIC_EVENT_TYPES: readonly string[] = ['loud_audio', 'mic_lost', 'mic_denied'];

function isSeriousType(type: ProctorRecordType): type is ProctorSeriousType {
  return (PROCTOR_SERIOUS_TYPES as readonly string[]).includes(type);
}

function isCountedType(type: ProctorRecordType): type is ProctorCountedType {
  return (PROCTOR_COUNTED_TYPES as readonly string[]).includes(type);
}

export class ExamService implements ExamHooks {
  private readonly engine: LiveEngine;
  private readonly publisher: LivePublisher;
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly sweepIntervalMs: number;
  private readonly progressThrottleMs: number;
  private readonly proctorFlushMs: number;
  private readonly randomSeed: () => number;
  private readonly entries = new Map<string, AttemptEntry>();
  private readonly liveCounts = new Map<string, ProctorCounts>();
  private readonly participantsBySession = new Map<string, Set<string>>();
  private readonly progressTimers = new Map<string, NodeJS.Timeout>();
  private proctorBuffer: ProctorEventRecord[] = [];
  private proctorTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(options: ExamServiceOptions) {
    this.engine = options.engine;
    this.publisher = options.publisher;
    this.now = options.now ?? Date.now;
    this.graceMs = options.graceMs ?? ANSWER_GRACE_MS;
    this.sweepIntervalMs = options.sweepIntervalMs ?? EXAM_SWEEP_INTERVAL_MS;
    this.progressThrottleMs = options.progressThrottleMs ?? EXAM_PROGRESS_THROTTLE_MS;
    this.proctorFlushMs = options.proctorFlushMs ?? PROCTOR_FLUSH_INTERVAL_MS;
    this.randomSeed = options.randomSeed ?? (() => randomInt(1, 2 ** 31));
  }

  start() {
    if (this.sweepTimer) {
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.runSweep();
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  async stop() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const timer of this.progressTimers.values()) {
      clearTimeout(timer);
    }
    this.progressTimers.clear();
    await this.flushProctor();
  }

  private get repository() {
    return this.engine.repository;
  }

  private register(entry: AttemptEntry) {
    this.entries.set(entry.attempt.participantId, entry);
    const members = this.participantsBySession.get(entry.attempt.sessionId) ?? new Set<string>();
    members.add(entry.attempt.participantId);
    this.participantsBySession.set(entry.attempt.sessionId, members);
  }

  async loadRehydrated(sessionId: string): Promise<void> {
    const attempts = await this.repository.listExamAttempts(sessionId);
    const events = await this.repository.listProctorEvents(sessionId);
    for (const attempt of attempts) {
      const answers = await this.repository.listExamAnswers(attempt.id);
      const counts = emptyProctorCounts();
      let autoSubmitted = false;
      for (const event of events) {
        if (event.participantId !== attempt.participantId) {
          continue;
        }
        if (isCountedType(event.type)) {
          counts[event.type] += 1;
        } else if (event.type === 'auto_submitted') {
          autoSubmitted = true;
        }
      }
      const entry: AttemptEntry = {
        attempt,
        answers: new Map(answers.map((answer) => [answer.questionId, answer])),
        counts,
        dropped: 0,
        submitting: null,
        autoSubmitted,
        submitReason: null,
      };
      this.register(entry);
      const context = this.engine.getExamContext(sessionId);
      if (context && attempt.submittedAtMs !== null) {
        await this.settleAttempt(entry, context, false);
      }
    }
  }

  private consentVersionOf(sessionId: string): string {
    const info = this.engine.getProctorInfo(sessionId);
    return consentVersionFor({ camera: info?.camera ?? false, mic: info?.mic ?? false });
  }

  private scoreOf(entry: AttemptEntry, context: ExamContext): number {
    const questionById = new Map(context.questions.map((question) => [question.id, question]));
    let correct = 0;
    for (const answer of entry.answers.values()) {
      if (questionById.get(answer.questionId)?.correctIndex === answer.chosenOriginalIndex) {
        correct += 1;
      }
    }
    return correct * EXAM_POINTS_PER_QUESTION;
  }

  studentView(sessionId: string, participantId: string): ExamStudentView | null {
    const context = this.engine.getExamContext(sessionId);
    if (!context) {
      return null;
    }
    const entry = this.entries.get(participantId);
    const durationMinutes = Math.round(context.durationMs / 60_000);
    const base = {
      durationMinutes,
      consentVersion: this.consentVersionOf(sessionId),
      resultsReleased: context.resultsReleasedAtMs !== null,
    };

    if (!entry) {
      return {
        ...base,
        phase:
          context.status === 'lobby'
            ? 'waiting'
            : context.status === 'running'
              ? 'consent'
              : 'closed',
        attempt: null,
        questions: [],
        answers: {},
      };
    }

    const { attempt } = entry;
    const attemptView = {
      attemptId: attempt.id,
      startedAtServerMs: attempt.startedAtMs,
      deadlineAtServerMs: attempt.deadlineAtMs,
      submittedAtServerMs: attempt.submittedAtMs,
    };
    if (attempt.submittedAtMs !== null) {
      return { ...base, phase: 'submitted', attempt: attemptView, questions: [], answers: {} };
    }

    const questionById = new Map(context.questions.map((question) => [question.id, question]));
    const questions = attempt.questionOrder.flatMap((questionId) => {
      const question = questionById.get(questionId);
      const optionOrder = attempt.optionOrders[questionId];
      if (!question || !optionOrder) {
        return [];
      }
      return [
        {
          questionId,
          stem: question.stem,
          ...questionImageOf(question),
          options: optionOrder.map((originalIndex) => question.options[originalIndex] ?? ''),
        },
      ];
    });
    const answers: Record<string, number> = {};
    for (const answer of entry.answers.values()) {
      const optionOrder = attempt.optionOrders[answer.questionId];
      const displayed = optionOrder
        ? originalToDisplayedIndex(optionOrder, answer.chosenOriginalIndex)
        : null;
      if (displayed !== null) {
        answers[answer.questionId] = displayed;
      }
    }
    return { ...base, phase: 'in_progress', attempt: attemptView, questions, answers };
  }

  hostProgress(sessionId: string): ExamProgressRow[] | null {
    const context = this.engine.getExamContext(sessionId);
    if (!context) {
      return null;
    }
    return this.engine
      .listSessionParticipants(sessionId)
      .map((participant): ExamProgressRow => {
        const entry = this.entries.get(participant.id);
        const submitted = entry?.attempt.submittedAtMs !== null && entry !== undefined;
        return {
          participantId: participant.id,
          displayName: participant.displayName,
          status: !entry ? 'not_started' : submitted ? 'submitted' : 'in_progress',
          answered: entry?.answers.size ?? 0,
          totalQuestions: entry
            ? entry.attempt.questionOrder.length
            : perStudentQuestionCount(context.questions, context.delivery.pools),
          startedAtServerMs: entry?.attempt.startedAtMs ?? null,
          deadlineAtServerMs: entry?.attempt.deadlineAtMs ?? null,
          proctorEventCount: entry
            ? PROCTOR_COUNTED_TYPES.reduce((sum, type) => sum + entry.counts[type], 0)
            : 0,
          droppedEvents: entry?.dropped ?? 0,
          score: entry && submitted ? this.scoreOf(entry, context) : null,
          autoSubmitted: entry?.autoSubmitted ?? false,
        };
      })
      .sort((first, second) => first.displayName.localeCompare(second.displayName));
  }

  getProgressPayload(sessionId: string): ExamProgressPayload | null {
    const context = this.engine.getExamContext(sessionId);
    const rows = this.hostProgress(sessionId);
    if (!context || !rows) {
      return null;
    }
    return {
      sessionId,
      serverNowMs: this.now(),
      resultsReleased: context.resultsReleasedAtMs !== null,
      rows,
    };
  }

  private emitProgress(sessionId: string) {
    const pending = this.progressTimers.get(sessionId);
    if (pending) {
      clearTimeout(pending);
      this.progressTimers.delete(sessionId);
    }
    const payload = this.getProgressPayload(sessionId);
    if (payload) {
      this.publisher.emitToHost(sessionId, 'exam:progress', payload);
    }
  }

  private scheduleProgress(sessionId: string) {
    if (this.progressTimers.has(sessionId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.progressTimers.delete(sessionId);
      this.emitProgress(sessionId);
    }, this.progressThrottleMs);
    timer.unref();
    this.progressTimers.set(sessionId, timer);
  }

  private resolve(participantId: string) {
    const reference = this.engine.getParticipantRef(participantId);
    const context = reference ? this.engine.getExamContext(reference.sessionId) : null;
    return reference && context ? { reference, context } : null;
  }

  hasSubmitted(participantId: string): boolean {
    const entry = this.entries.get(participantId);
    return Boolean(entry && entry.attempt.submittedAtMs !== null);
  }

  async startAttempt(participantId: string, consentVersion: string): Promise<ExamViewResult> {
    const resolved = this.resolve(participantId);
    if (!resolved) {
      return { ok: false, error: 'not_exam' };
    }
    const { reference, context } = resolved;
    if (consentVersion !== this.consentVersionOf(reference.sessionId)) {
      return { ok: false, error: 'consent_version_mismatch' };
    }
    if (context.status === 'lobby') {
      return { ok: false, error: 'exam_not_open' };
    }
    if (context.status === 'ended') {
      return { ok: false, error: 'session_ended' };
    }

    const existing = this.entries.get(participantId);
    if (existing) {
      await this.submitIfExpired(participantId);
      return this.viewResult(reference.sessionId, participantId);
    }

    const startedAtMs = this.now();
    const shuffleSeed = this.randomSeed();
    const orders = buildAttemptOrders(shuffleSeed, context.questions, context.delivery);
    const stored = await this.repository.createExamAttempt({
      id: randomUUID(),
      sessionId: reference.sessionId,
      participantId,
      consentAtMs: startedAtMs,
      consentVersion,
      startedAtMs,
      deadlineAtMs: startedAtMs + context.durationMs,
      submittedAtMs: null,
      shuffleSeed,
      questionOrder: orders.questionOrder,
      optionOrders: orders.optionOrders,
    });

    const alreadyRegistered = this.entries.get(participantId);
    if (!alreadyRegistered) {
      this.register({
        attempt: stored,
        answers: new Map(),
        counts: emptyProctorCounts(),
        dropped: 0,
        submitting: null,
        autoSubmitted: false,
        submitReason: null,
      });
      this.pushProctorRecord({
        sessionId: reference.sessionId,
        participantId,
        attemptId: stored.id,
        type: 'consent_given',
        clientAt: startedAtMs,
        detail: null,
      });
    }
    this.emitProgress(reference.sessionId);
    return this.viewResult(reference.sessionId, participantId);
  }

  private viewResult(sessionId: string, participantId: string): ExamViewResult {
    const view = this.studentView(sessionId, participantId);
    return view ? { ok: true, view } : { ok: false, error: 'not_exam' };
  }

  async submitIfExpired(participantId: string): Promise<void> {
    const entry = this.entries.get(participantId);
    if (
      entry &&
      entry.attempt.submittedAtMs === null &&
      this.now() > entry.attempt.deadlineAtMs + this.graceMs
    ) {
      await this.performSubmit(entry, 'deadline');
    }
  }

  async saveAnswer(
    participantId: string,
    payload: ExamAnswerPayload,
  ): Promise<Ack<{ answeredCount: number }>> {
    const resolved = this.resolve(participantId);
    if (!resolved) {
      return { ok: false, error: 'not_exam' };
    }
    const entry = this.entries.get(participantId);
    if (!entry) {
      return { ok: false, error: 'consent_required' };
    }
    if (entry.attempt.submittedAtMs !== null) {
      return { ok: false, error: 'no_open_attempt' };
    }
    if (this.now() > entry.attempt.deadlineAtMs + this.graceMs) {
      await this.performSubmit(entry, 'deadline');
      return { ok: false, error: 'attempt_expired' };
    }

    const optionOrder = entry.attempt.optionOrders[payload.questionId];
    if (!optionOrder) {
      return { ok: false, error: 'wrong_question' };
    }
    const chosenOriginalIndex = displayedToOriginalIndex(optionOrder, payload.displayedIndex);
    if (chosenOriginalIndex === null) {
      return { ok: false, error: 'invalid_payload' };
    }

    const answer: ExamAnswerRecord = {
      attemptId: entry.attempt.id,
      questionId: payload.questionId,
      chosenOriginalIndex,
      savedAtMs: this.now(),
    };
    try {
      await this.repository.upsertExamAnswer(answer);
    } catch (error) {
      console.error('Saving an exam answer failed', error);
      return { ok: false, error: 'server_error' };
    }
    entry.answers.set(payload.questionId, answer);
    this.scheduleProgress(resolved.reference.sessionId);
    return { ok: true, answeredCount: entry.answers.size };
  }

  async submit(participantId: string, reason: ExamSubmitReason): Promise<ExamViewResult> {
    const resolved = this.resolve(participantId);
    if (!resolved) {
      return { ok: false, error: 'not_exam' };
    }
    const entry = this.entries.get(participantId);
    if (!entry) {
      return { ok: false, error: 'consent_required' };
    }
    await this.performSubmit(entry, reason);
    return this.viewResult(resolved.reference.sessionId, participantId);
  }

  private performSubmit(entry: AttemptEntry, reason: ExamSubmitReason): Promise<void> {
    if (entry.attempt.submittedAtMs !== null) {
      return Promise.resolve();
    }
    if (entry.submitting) {
      return entry.submitting;
    }
    entry.submitting = this.finalizeAttempt(entry, reason).finally(() => {
      entry.submitting = null;
    });
    return entry.submitting;
  }

  private async finalizeAttempt(entry: AttemptEntry, reason: ExamSubmitReason): Promise<void> {
    const { attempt } = entry;
    const context = this.engine.getExamContext(attempt.sessionId);
    const submittedAtMs = Math.min(this.now(), attempt.deadlineAtMs + this.graceMs);
    let newlySubmitted = false;
    try {
      newlySubmitted = await this.repository.submitExamAttempt(attempt.id, submittedAtMs);
    } catch (error) {
      console.error('Submitting an exam attempt failed', error);
      return;
    }
    attempt.submittedAtMs = attempt.submittedAtMs ?? submittedAtMs;
    if (!newlySubmitted || !context) {
      this.emitProgress(attempt.sessionId);
      return;
    }

    entry.submitReason = reason;
    await this.settleAttempt(entry, context, true);
    this.publisher.emitToParticipant(attempt.participantId, 'exam:submitted', { reason });
    this.emitProgress(attempt.sessionId);
  }

  private async settleAttempt(entry: AttemptEntry, context: ExamContext, persist: boolean) {
    const { attempt } = entry;
    const questionIndexById = new Map(
      context.questions.map((question, index) => [question.id, index]),
    );
    const analytics = this.engine.getSessionAnalytics(attempt.sessionId);
    let score = 0;
    let totalResponseMs = 0;

    for (const answer of entry.answers.values()) {
      const questionIndex = questionIndexById.get(answer.questionId);
      const question = questionIndex === undefined ? undefined : context.questions[questionIndex];
      if (!question || questionIndex === undefined) {
        continue;
      }
      const correct = answer.chosenOriginalIndex === question.correctIndex;
      const points = correct ? EXAM_POINTS_PER_QUESTION : 0;
      const responseMs = Math.round(
        Math.min(Math.max(answer.savedAtMs - attempt.startedAtMs, 0), context.durationMs),
      );
      score += points;
      totalResponseMs += responseMs;

      if (persist) {
        try {
          await this.repository.insertResponse({
            sessionId: attempt.sessionId,
            participantId: attempt.participantId,
            questionId: answer.questionId,
            chosenIndex: answer.chosenOriginalIndex,
            correct,
            responseMs,
            points,
            servedAtIso: new Date(attempt.startedAtMs).toISOString(),
            answeredAtIso: new Date(answer.savedAtMs).toISOString(),
          });
        } catch (error) {
          console.error('Writing an exam response failed', error);
        }
      }
      analytics?.onResponse({
        participantId: attempt.participantId,
        questionId: answer.questionId,
        round: questionIndex + 1,
        correct,
        points,
        responseMs,
        durationMs: context.durationMs,
      });
    }
    this.engine.applyExamResult(attempt.participantId, score, totalResponseMs);
  }

  async getResults(
    participantId: string,
  ): Promise<Ack<{ released: false } | { released: true; results: ExamResults }>> {
    const resolved = this.resolve(participantId);
    if (!resolved) {
      return { ok: false, error: 'not_exam' };
    }
    await this.submitIfExpired(participantId);
    const entry = this.entries.get(participantId);
    if (!entry || entry.attempt.submittedAtMs === null) {
      return { ok: false, error: 'not_submitted' };
    }
    const { context } = resolved;
    if (context.resultsReleasedAtMs === null) {
      return { ok: true, released: false };
    }

    const questionById = new Map(context.questions.map((question) => [question.id, question]));
    let correctCount = 0;
    const questions = entry.attempt.questionOrder.flatMap((questionId): ExamResultQuestion[] => {
      const question = questionById.get(questionId);
      const optionOrder = entry.attempt.optionOrders[questionId];
      if (!question || !optionOrder) {
        return [];
      }
      const answer = entry.answers.get(questionId);
      if (!answer) {
        return [
          { questionId, stem: question.stem, chosenOption: null, chosenIndex: null, correct: null },
        ];
      }
      const correct = answer.chosenOriginalIndex === question.correctIndex;
      if (correct) {
        correctCount += 1;
      }
      return [
        {
          questionId,
          stem: question.stem,
          chosenOption: question.options[answer.chosenOriginalIndex] ?? null,
          chosenIndex: originalToDisplayedIndex(optionOrder, answer.chosenOriginalIndex),
          correct,
        },
      ];
    });
    return {
      ok: true,
      released: true,
      results: {
        score: correctCount * EXAM_POINTS_PER_QUESTION,
        correctCount,
        total: entry.attempt.questionOrder.length,
        questions,
      },
    };
  }

  async releaseResults(sessionId: string, hostId: string): Promise<{ releasedAtMs: number }> {
    const context = this.engine.getExamContext(sessionId);
    if (!context) {
      return this.releaseFromDatabase(sessionId, hostId);
    }
    if (context.hostId !== hostId) {
      throw new EngineError('session_not_found', 'Session not found');
    }
    if (context.resultsReleasedAtMs !== null) {
      return { releasedAtMs: context.resultsReleasedAtMs };
    }
    const releasedAtMs = await this.repository.setResultsReleased(sessionId, this.now());
    this.engine.markResultsReleased(sessionId, releasedAtMs);
    this.publisher.emitToSession(sessionId, 'exam:released', {});
    this.emitProgress(sessionId);
    return { releasedAtMs };
  }

  private async releaseFromDatabase(
    sessionId: string,
    hostId: string,
  ): Promise<{ releasedAtMs: number }> {
    const record = await this.repository.findSummaryRecord(sessionId);
    if (!record || record.hostId !== hostId || record.session.exam_duration_minutes === null) {
      throw new EngineError('session_not_found', 'Session not found');
    }
    if (record.session.results_released_at) {
      return { releasedAtMs: Date.parse(record.session.results_released_at) };
    }
    return { releasedAtMs: await this.repository.setResultsReleased(sessionId, this.now()) };
  }

  async beforeSessionEnds(sessionId: string): Promise<void> {
    const members = this.participantsBySession.get(sessionId) ?? new Set<string>();
    for (const participantId of members) {
      const entry = this.entries.get(participantId);
      if (entry && entry.attempt.submittedAtMs === null) {
        await this.performSubmit(entry, 'host_ended');
      }
    }
    await this.flushProctor();
    const analytics = this.engine.getSessionAnalytics(sessionId);
    for (const participantId of members) {
      const entry = this.entries.get(participantId);
      if (entry) {
        analytics?.setProctorCounts(participantId, { ...entry.counts });
      }
    }
  }

  async runSweep(): Promise<void> {
    const nowMs = this.now();
    const expired = [...this.entries.values()].filter(
      (entry) =>
        entry.attempt.submittedAtMs === null && nowMs > entry.attempt.deadlineAtMs + this.graceMs,
    );
    for (const entry of expired) {
      await this.performSubmit(entry, 'deadline');
    }
  }

  recordDropped(participantId: string) {
    const entry = this.entries.get(participantId);
    if (entry) {
      entry.dropped += 1;
      this.scheduleProgress(entry.attempt.sessionId);
    }
  }

  async recordProctorEvent(participantId: string, payload: ProctorEventPayload): Promise<Ack> {
    const reference = this.engine.getParticipantRef(participantId);
    const info = reference ? this.engine.getProctorInfo(reference.sessionId) : null;
    if (!reference || !info || info.status !== 'running') {
      return { ok: false, error: 'no_open_attempt' };
    }
    if (!info.proctored) {
      return { ok: true };
    }
    // A camera or microphone event for a device the host did not turn on is ignored.
    if (
      (CAMERA_EVENT_TYPES.includes(payload.type) && !info.camera) ||
      (MIC_EVENT_TYPES.includes(payload.type) && !info.mic)
    ) {
      return { ok: true };
    }
    if (!info.exam) {
      return this.recordLiveProctorEvent(participantId, reference.sessionId, payload);
    }
    const resolved = this.resolve(participantId);
    if (!resolved) {
      return { ok: false, error: 'no_open_attempt' };
    }
    const entry = this.entries.get(participantId);
    if (!entry) {
      return { ok: false, error: 'consent_required' };
    }
    if (
      entry.attempt.submittedAtMs !== null ||
      this.now() > entry.attempt.deadlineAtMs + this.graceMs
    ) {
      return { ok: false, error: 'no_open_attempt' };
    }

    const detail = 'detail' in payload ? { ...payload.detail } : null;
    const record = this.pushProctorRecord({
      sessionId: entry.attempt.sessionId,
      participantId,
      attemptId: entry.attempt.id,
      type: payload.type,
      clientAt: payload.clientAt,
      detail,
    });
    if (isCountedType(record.type)) {
      entry.counts[record.type] += 1;
    }
    this.scheduleProgress(entry.attempt.sessionId);
    if (isSeriousType(record.type)) {
      await this.afterSeriousFlag(entry, record.type, record.clientAt, info.flagLimit);
    }
    return { ok: true };
  }

  /** Tells the student their count and, at the host's limit, submits the exam once. */
  private async afterSeriousFlag(
    entry: AttemptEntry,
    type: ProctorSeriousType,
    flagClientAt: number,
    limit: number | null,
  ): Promise<void> {
    const count = seriousFlagCount(entry.counts);
    this.publisher.emitToParticipant(entry.attempt.participantId, 'proctor:flags', {
      count,
      limit,
      type,
    });
    if (limit === null || count < limit || entry.autoSubmitted) {
      return;
    }
    await this.performSubmit(entry, 'proctor_limit');
    // Only claim the submit once it really happened and was ours: a failed save is retried by
    // the next flag, and a submit the student or the clock had already started stays theirs.
    if (entry.submitReason !== 'proctor_limit' || entry.autoSubmitted) {
      return;
    }
    entry.autoSubmitted = true;
    this.pushProctorRecord({
      sessionId: entry.attempt.sessionId,
      participantId: entry.attempt.participantId,
      attemptId: entry.attempt.id,
      type: 'auto_submitted',
      // Just after the flag that triggered it, so the timeline never shows it earlier.
      clientAt: Math.max(this.now(), flagClientAt) + 1,
      detail: { count, limit },
    });
    await this.flushProctor();
  }

  private recordLiveProctorEvent(
    participantId: string,
    sessionId: string,
    payload: ProctorEventPayload,
  ): Ack {
    const record = this.pushProctorRecord({
      sessionId,
      participantId,
      attemptId: null,
      type: payload.type,
      clientAt: payload.clientAt,
      detail: 'detail' in payload ? { ...payload.detail } : null,
    });
    if (isCountedType(record.type)) {
      const counts = this.liveCounts.get(participantId) ?? emptyProctorCounts();
      counts[record.type] += 1;
      this.liveCounts.set(participantId, counts);
      this.engine.getSessionAnalytics(sessionId)?.setProctorCounts(participantId, { ...counts });
      if (isSeriousType(record.type)) {
        this.publisher.emitToParticipant(participantId, 'proctor:flags', {
          count: seriousFlagCount(counts),
          limit: null,
          type: record.type,
        });
      }
    }
    return { ok: true };
  }

  private pushProctorRecord(input: {
    sessionId: string;
    participantId: string;
    attemptId: string | null;
    type: ProctorRecordType;
    clientAt: number;
    detail: Record<string, unknown> | null;
  }): ProctorEventRecord {
    const serverAt = this.now();
    const record: ProctorEventRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      participantId: input.participantId,
      attemptId: input.attemptId,
      type: input.type,
      clientAt: input.clientAt,
      serverAt,
      late: serverAt - input.clientAt > PROCTOR_LATE_AFTER_MS,
      detail: input.detail,
    };
    this.publisher.emitToHost(input.sessionId, 'proctor:timeline', record);
    this.proctorBuffer.push(record);
    if (!this.proctorTimer) {
      this.proctorTimer = setTimeout(() => {
        void this.flushProctor();
      }, this.proctorFlushMs);
      this.proctorTimer.unref();
    }
    return record;
  }

  async flushProctor(): Promise<void> {
    if (this.proctorTimer) {
      clearTimeout(this.proctorTimer);
      this.proctorTimer = null;
    }
    const batch = this.proctorBuffer;
    this.proctorBuffer = [];
    if (batch.length === 0) {
      return;
    }
    try {
      await this.repository.insertProctorEvents(batch);
    } catch {
      try {
        await this.repository.insertProctorEvents(batch);
      } catch (error) {
        console.error(`Persisting ${batch.length} proctor events failed`, error);
      }
    }
  }

  async getProctorTimeline(
    sessionId: string,
    user: MeResponse,
  ): Promise<AnalyticsAccess<ProctorParticipantTimeline[]>> {
    const record = await this.repository.findSummaryRecord(sessionId);
    if (!record) {
      return { kind: 'not_found' };
    }
    if (!mayRead(record.hostId, user)) {
      return { kind: 'forbidden' };
    }

    await this.flushProctor();
    const [events, names, attempts] = await Promise.all([
      this.repository.listProctorEvents(sessionId),
      this.repository.listParticipantNames(sessionId),
      this.repository.listExamAttempts(sessionId),
    ]);
    const attemptStartByParticipant = new Map(
      attempts.map((attempt) => [attempt.participantId, attempt.startedAtMs]),
    );

    const timelines = names.map((participant): ProctorParticipantTimeline => {
      const participantEvents = events.filter((event) => event.participantId === participant.id);
      const counts = emptyProctorCounts();
      for (const event of participantEvents) {
        if (isCountedType(event.type)) {
          counts[event.type] += 1;
        }
      }
      return {
        participantId: participant.id,
        displayName: participant.displayName,
        attemptStartedAtMs: attemptStartByParticipant.get(participant.id) ?? null,
        counts,
        droppedEvents: this.entries.get(participant.id)?.dropped ?? 0,
        events: participantEvents,
      };
    });
    timelines.sort((first, second) => first.displayName.localeCompare(second.displayName));
    return { kind: 'ok', value: timelines };
  }
}
