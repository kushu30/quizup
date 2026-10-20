import {
  buildStudentResult,
  quizSettingsSchema,
  type MeResponse,
  type StudentResult,
} from '@quizup/shared';
import type { AnalyticsService } from '../analytics/analyticsService.js';
import type { LiveEngine } from '../live/engine.js';

export type StudentResultAccess =
  | { kind: 'ok'; value: StudentResult }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'not_ready'; reason: 'session_not_finished' | 'results_not_released' };

type Audience = 'host' | 'student';

export class StudentResultService {
  private readonly engine: LiveEngine;
  private readonly analytics: AnalyticsService;

  constructor(engine: LiveEngine, analytics: AnalyticsService) {
    this.engine = engine;
    this.analytics = analytics;
  }

  /** One student's full result, for the host who owns the quiz (or an admin). */
  async forHost(
    sessionId: string,
    participantId: string,
    user: MeResponse,
  ): Promise<StudentResultAccess> {
    const record = await this.engine.repository.findSummaryRecord(sessionId);
    if (!record) {
      return { kind: 'not_found' };
    }
    if (record.hostId !== user.id && user.role !== 'admin') {
      return { kind: 'forbidden' };
    }
    return this.build(sessionId, participantId, 'host');
  }

  /** The signed-in student's own result for a finished session. */
  async forStudent(sessionId: string, user: MeResponse): Promise<StudentResultAccess> {
    const participations = await this.engine.repository.listParticipationsForUser(user.id);
    const entry = participations.find((candidate) => candidate.session.id === sessionId);
    if (!entry) {
      return { kind: 'not_found' };
    }
    if (entry.session.status !== 'ended') {
      return { kind: 'not_ready', reason: 'session_not_finished' };
    }
    if (
      entry.session.exam_duration_minutes !== null &&
      entry.session.results_released_at === null
    ) {
      return { kind: 'not_ready', reason: 'results_not_released' };
    }
    return this.build(sessionId, entry.participantId, 'student');
  }

  private async build(
    sessionId: string,
    participantId: string,
    audience: Audience,
  ): Promise<StudentResultAccess> {
    const repository = this.engine.repository;
    const record = await repository.findSummaryRecord(sessionId);
    const source = record ? await repository.loadSessionAnalyticsSource(sessionId) : null;
    if (!record || !source) {
      return { kind: 'not_found' };
    }
    const participant = source.participants.find((candidate) => candidate.id === participantId);
    if (!participant) {
      return { kind: 'not_found' };
    }
    const snapshot = await this.analytics.snapshotFor(sessionId, record);
    if (snapshot.kind !== 'ok') {
      return { kind: 'not_found' };
    }
    const standing = snapshot.value.participants.find(
      (candidate) => candidate.participantId === participantId,
    );

    const quiz = await repository.findOwnedQuiz(record.session.quiz_id, record.hostId);
    const parsedSettings = quizSettingsSchema.safeParse(quiz?.settings ?? {});
    const mode = record.session.exam_duration_minutes === null ? 'live' : 'exam';
    const showCorrect =
      audience === 'host' ||
      (parsedSettings.success
        ? (parsedSettings.data.showCorrectAnswers ?? mode !== 'exam')
        : mode !== 'exam');

    const responses = source.responses
      .filter((response) => response.participantId === participantId)
      .sort((first, second) => first.answeredAtMs - second.answeredAtMs);
    const adaptive = snapshot.value.adaptive;

    let questionOrder: string[];
    let timeTakenMs: number | null;
    if (mode === 'exam') {
      const attempts = await repository.listExamAttempts(sessionId);
      const attempt = attempts.find((candidate) => candidate.participantId === participantId);
      questionOrder = attempt?.questionOrder ?? responses.map((response) => response.questionId);
      timeTakenMs =
        attempt && attempt.submittedAtMs !== null
          ? Math.max(attempt.submittedAtMs - attempt.startedAtMs, 0)
          : null;
    } else {
      questionOrder = adaptive
        ? responses.map((response) => response.questionId)
        : record.session.question_ids;
      timeTakenMs = responses.reduce((total, response) => total + response.responseMs, 0);
    }

    return {
      kind: 'ok',
      value: buildStudentResult({
        sessionId,
        participantId,
        displayName: participant.displayName,
        quizTitle: quiz?.title ?? 'Quiz',
        mode,
        adaptive,
        score: standing?.score ?? 0,
        rank: standing?.rank ?? null,
        participantCount: source.participants.length,
        questionOrder,
        questions: source.questions,
        responses,
        timeTakenMs,
        showCorrect,
      }),
    };
  }
}
