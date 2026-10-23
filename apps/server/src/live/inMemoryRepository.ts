import { randomUUID } from 'node:crypto';
import {
  ELO_MAX_RATING,
  ELO_MIN_RATING,
  type DeviceInfo,
  initialQuestionRating,
  questionImageOf,
  type Participant,
  type ProctorEventRecord,
  type Session,
} from '@quizup/shared';
import type {
  LiveQuestion,
  LiveRepository,
  NewParticipantInput,
  NewResponseInput,
  NewRosterInput,
  RosterRecord,
  ExamAnswerRecord,
  ExamAttemptRecord,
  OpenExamSession,
  SessionAnalyticsSource,
  SessionUpdate,
  SummaryRecord,
} from './types.js';

interface StoredQuiz {
  id: string;
  title: string;
  hostId: string;
  settings: unknown;
  questions: (LiveQuestion & { approved: boolean })[];
}

export type SeedQuestion = Pick<LiveQuestion, 'id' | 'stem' | 'options' | 'correctIndex'> &
  Partial<
    Pick<
      LiveQuestion,
      'topic' | 'difficulty' | 'eloRating' | 'answersCount' | 'imageUrl' | 'imageAlt'
    >
  > & {
    approved?: boolean;
  };

export interface StoredResponse extends NewResponseInput {
  participantEloBefore?: number;
  questionEloBefore?: number;
}

export interface StoredKnowledgeState {
  participantId: string;
  topic: string;
  pMastery: number;
}

export class InMemoryLiveRepository implements LiveRepository {
  readonly quizzes = new Map<string, StoredQuiz>();
  readonly sessionFeedback: {
    sessionId: string;
    participantId: string;
    rating: number;
    comment: string | null;
    createdAt: string;
  }[] = [];
  readonly roster: RosterRecord[] = [];
  readonly sessions = new Map<string, { session: Session; hostId: string }>();
  readonly participants: Participant[] = [];
  readonly responses: StoredResponse[] = [];
  readonly knowledgeStates: StoredKnowledgeState[] = [];
  readonly storedSummaries = new Map<string, unknown>();
  summaryWriteCount = 0;
  readonly examAttempts: ExamAttemptRecord[] = [];
  readonly examAnswers: ExamAnswerRecord[] = [];
  readonly proctorEvents: ProctorEventRecord[] = [];
  failProctorInsertsRemaining = 0;

  seedQuiz(input: {
    hostId: string;
    title?: string;
    settings?: unknown;
    questions: SeedQuestion[];
  }): string {
    const id = randomUUID();
    this.quizzes.set(id, {
      id,
      title: input.title ?? 'Seeded quiz',
      hostId: input.hostId,
      settings: input.settings ?? {},
      questions: input.questions.map((question) => {
        const difficulty = question.difficulty ?? 'medium';
        return {
          id: question.id,
          stem: question.stem,
          options: question.options,
          correctIndex: question.correctIndex,
          topic: question.topic ?? 'General',
          difficulty,
          eloRating: question.eloRating ?? initialQuestionRating(difficulty),
          answersCount: question.answersCount ?? 0,
          approved: question.approved ?? true,
          ...questionImageOf(question),
        };
      }),
    });
    return id;
  }

  async findOwnedQuiz(quizId: string, hostId: string) {
    const quiz = this.quizzes.get(quizId);
    return quiz && quiz.hostId === hostId
      ? { id: quiz.id, title: quiz.title, settings: quiz.settings }
      : null;
  }

  async listApprovedQuestions(quizId: string): Promise<LiveQuestion[]> {
    const quiz = this.quizzes.get(quizId);
    return (quiz?.questions ?? [])
      .filter((question) => question.approved)
      .map((question) => ({
        id: question.id,
        stem: question.stem,
        options: question.options,
        correctIndex: question.correctIndex,
        topic: question.topic,
        difficulty: question.difficulty,
        eloRating: question.eloRating,
        answersCount: question.answersCount,
        ...questionImageOf(question),
      }));
  }

  async loadQuestionsByIds(questionIds: string[]) {
    const wanted = new Set(questionIds);
    const found: (LiveQuestion & { approved: boolean })[] = [];
    for (const quiz of this.quizzes.values()) {
      for (const question of quiz.questions) {
        if (wanted.has(question.id)) {
          found.push({ ...question });
        }
      }
    }
    return found;
  }

  async createSession(input: {
    quizId: string;
    joinCode: string;
    questionIds: string[];
    examDurationMinutes: number | null;
  }) {
    const quiz = this.quizzes.get(input.quizId);
    const codeTaken = [...this.sessions.values()].some(
      (stored) => stored.session.join_code === input.joinCode,
    );
    if (!quiz || codeTaken) {
      return null;
    }
    const session: Session = {
      id: randomUUID(),
      quiz_id: input.quizId,
      join_code: input.joinCode,
      status: 'lobby',
      started_at: null,
      ended_at: null,
      question_ids: input.questionIds,
      exam_duration_minutes: input.examDurationMinutes,
      results_released_at: null,
      proctored: false,
      proctor_camera: false,
      proctor_mic: false,
      proctor_flag_limit: null,
    };
    this.sessions.set(session.id, { session, hostId: quiz.hostId });
    return session;
  }

  async findSessionWithHost(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }

  async updateSession(sessionId: string, update: SessionUpdate) {
    const stored = this.sessions.get(sessionId);
    if (stored) {
      stored.session = { ...stored.session, ...update };
    }
  }

  async insertParticipant(input: NewParticipantInput): Promise<Participant | 'name_taken'> {
    const nameKey = input.displayName.toLowerCase();
    const nameTaken = this.participants.some(
      (participant) =>
        participant.session_id === input.sessionId &&
        participant.display_name.toLowerCase() === nameKey,
    );
    if (nameTaken) {
      return 'name_taken';
    }
    const participant: Participant = {
      id: randomUUID(),
      session_id: input.sessionId,
      user_id: input.userId ?? null,
      display_name: input.displayName,
      elo: 1000,
      joined_at: new Date().toISOString(),
      rejoin_token_hash: input.rejoinTokenHash,
      devices: [],
    };
    this.participants.push(participant);
    return participant;
  }

  async listRoster(sessionId: string): Promise<RosterRecord[]> {
    return this.roster
      .filter((entry) => entry.sessionId === sessionId)
      .map((entry) => ({ ...entry }));
  }

  async insertRoster(entries: NewRosterInput[]): Promise<RosterRecord[] | 'name_taken'> {
    const taken = new Set(
      this.roster.map((entry) => `${entry.sessionId}:${entry.displayName.toLowerCase()}`),
    );
    for (const entry of entries) {
      const key = `${entry.sessionId}:${entry.displayName.toLowerCase()}`;
      if (taken.has(key)) {
        return 'name_taken';
      }
      taken.add(key);
    }
    const created = entries.map((entry) => ({ ...entry, id: randomUUID(), participantId: null }));
    this.roster.push(...created);
    return created.map((entry) => ({ ...entry }));
  }

  async updateRosterEntry(
    rosterId: string,
    patch: { tokenHash?: string; participantId?: string | null },
  ) {
    const entry = this.roster.find((candidate) => candidate.id === rosterId);
    if (!entry) {
      return;
    }
    if (patch.tokenHash !== undefined) {
      entry.tokenHash = patch.tokenHash;
    }
    if (patch.participantId !== undefined) {
      entry.participantId = patch.participantId;
    }
  }

  async deleteRosterEntry(rosterId: string) {
    const index = this.roster.findIndex((candidate) => candidate.id === rosterId);
    if (index !== -1) {
      this.roster.splice(index, 1);
    }
  }

  async updateParticipantTokenHash(participantId: string, tokenHash: string) {
    const participant = this.participants.find((candidate) => candidate.id === participantId);
    if (participant) {
      participant.rejoin_token_hash = tokenHash;
    }
  }

  async updateParticipantDevices(participantId: string, devices: DeviceInfo[]) {
    const participant = this.participants.find((candidate) => candidate.id === participantId);
    if (participant) {
      participant.devices = devices;
    }
  }

  async insertResponse(input: NewResponseInput): Promise<'inserted' | 'duplicate'> {
    const duplicate = this.responses.some(
      (response) =>
        response.participantId === input.participantId && response.questionId === input.questionId,
    );
    if (duplicate) {
      return 'duplicate';
    }
    this.responses.push(input);
    return 'inserted';
  }

  async recordResponseRatings(input: {
    participantId: string;
    questionId: string;
    participantEloBefore: number;
    questionEloBefore: number;
  }) {
    const response = this.responses.find(
      (candidate) =>
        candidate.participantId === input.participantId &&
        candidate.questionId === input.questionId,
    );
    if (response) {
      response.participantEloBefore = input.participantEloBefore;
      response.questionEloBefore = input.questionEloBefore;
    }
  }

  async applyQuestionRatingDelta(questionId: string, delta: number) {
    for (const quiz of this.quizzes.values()) {
      const question = quiz.questions.find((candidate) => candidate.id === questionId);
      if (question) {
        question.eloRating = Math.min(
          Math.max(question.eloRating + delta, ELO_MIN_RATING),
          ELO_MAX_RATING,
        );
        question.answersCount += 1;
        return question.eloRating;
      }
    }
    return Number.NaN;
  }

  async updateParticipantElo(participantId: string, elo: number) {
    const index = this.participants.findIndex((participant) => participant.id === participantId);
    const existing = this.participants[index];
    if (existing) {
      this.participants[index] = { ...existing, elo };
    }
  }

  async upsertKnowledgeState(input: StoredKnowledgeState) {
    const existing = this.knowledgeStates.find(
      (state) => state.participantId === input.participantId && state.topic === input.topic,
    );
    if (existing) {
      existing.pMastery = input.pMastery;
    } else {
      this.knowledgeStates.push({ ...input });
    }
  }

  async findSummaryRecord(sessionId: string): Promise<SummaryRecord | null> {
    const stored = this.sessions.get(sessionId);
    return stored
      ? {
          session: stored.session,
          hostId: stored.hostId,
          storedSummary: this.storedSummaries.get(sessionId) ?? null,
        }
      : null;
  }

  async saveSessionSummary(sessionId: string, summary: unknown) {
    if (!this.storedSummaries.has(sessionId)) {
      this.storedSummaries.set(sessionId, summary);
      this.summaryWriteCount += 1;
    }
  }

  async loadSessionAnalyticsSource(sessionId: string): Promise<SessionAnalyticsSource | null> {
    const stored = this.sessions.get(sessionId);
    if (!stored) {
      return null;
    }
    const participants = this.participants.filter(
      (participant) => participant.session_id === sessionId,
    );
    const participantIds = new Set(participants.map((participant) => participant.id));
    const responses = this.responses.filter((response) => response.sessionId === sessionId);
    const questionIds = new Set([
      ...stored.session.question_ids,
      ...responses.map((response) => response.questionId),
    ]);
    const questions = [...this.quizzes.values()]
      .flatMap((quiz) => quiz.questions)
      .filter((question) => questionIds.has(question.id))
      .map((question) => ({
        id: question.id,
        stem: question.stem,
        options: question.options,
        correctIndex: question.correctIndex,
        topic: question.topic,
        difficulty: question.difficulty,
        answersCount: question.answersCount,
      }));
    return {
      session: stored.session,
      hostId: stored.hostId,
      proctorEvents: this.proctorEvents
        .filter((event) => event.sessionId === sessionId)
        .map((event) => ({ participantId: event.participantId, type: event.type })),
      participants: participants.map((participant) => ({
        id: participant.id,
        displayName: participant.display_name,
        elo: participant.elo,
        joinedAtMs: Date.parse(participant.joined_at),
        devices: participant.devices,
      })),
      questions,
      responses: responses.map((response) => ({
        participantId: response.participantId,
        questionId: response.questionId,
        chosenIndex: response.chosenIndex,
        correct: response.correct,
        responseMs: response.responseMs,
        points: response.points,
        answeredAtMs: Date.parse(response.answeredAtIso),
        participantEloBefore: response.participantEloBefore ?? null,
        questionEloBefore: response.questionEloBefore ?? null,
      })),
      knowledgeStates: this.knowledgeStates.filter((state) =>
        participantIds.has(state.participantId),
      ),
    };
  }

  async listQuizSessions(quizId: string) {
    return [...this.sessions.values()]
      .filter((stored) => stored.session.quiz_id === quizId)
      .map((stored) => ({
        session: stored.session,
        participantCount: this.participants.filter(
          (participant) => participant.session_id === stored.session.id,
        ).length,
        summary: this.storedSummaries.get(stored.session.id) ?? null,
      }));
  }

  async listSessionsForHost(hostId: string) {
    return [...this.sessions.values()]
      .filter((stored) => stored.hostId === hostId)
      .map((stored) => stored.session);
  }

  async listFeedbackRatings(sessionIds: string[]) {
    return this.sessionFeedback
      .filter((row) => sessionIds.includes(row.sessionId))
      .map((row) => ({ sessionId: row.sessionId, rating: row.rating }));
  }

  async listParticipationsForUser(userId: string) {
    return this.participants
      .filter((participant) => participant.user_id === userId)
      .flatMap((participant) => {
        const stored = this.sessions.get(participant.session_id);
        const quiz = stored ? this.quizzes.get(stored.session.quiz_id) : undefined;
        if (!stored || !quiz) {
          return [];
        }
        return [
          {
            session: stored.session,
            quizTitle: quiz.title,
            quizSettings: quiz.settings,
            participantId: participant.id,
            participantCount: this.participants.filter(
              (other) => other.session_id === participant.session_id,
            ).length,
            summary: this.storedSummaries.get(participant.session_id) ?? null,
          },
        ];
      });
  }

  async upsertSessionFeedback(input: {
    sessionId: string;
    participantId: string;
    rating: number;
    comment: string | null;
  }) {
    const existing = this.sessionFeedback.find(
      (row) => row.sessionId === input.sessionId && row.participantId === input.participantId,
    );
    if (existing) {
      existing.rating = input.rating;
      existing.comment = input.comment;
      return;
    }
    this.sessionFeedback.push({ ...input, createdAt: new Date().toISOString() });
  }

  async listSessionFeedback(sessionId: string) {
    return this.sessionFeedback
      .filter((row) => row.sessionId === sessionId)
      .map((row) => ({ rating: row.rating, comment: row.comment }));
  }

  async listOpenExamSessions(): Promise<OpenExamSession[]> {
    return [...this.sessions.values()]
      .filter(
        (stored) =>
          stored.session.exam_duration_minutes !== null &&
          (stored.session.status !== 'ended' ||
            Date.parse(stored.session.ended_at ?? '') > Date.now() - 7 * 24 * 60 * 60 * 1000),
      )
      .map((stored) => ({
        session: stored.session,
        hostId: stored.hostId,
        quizTitle: this.quizzes.get(stored.session.quiz_id)?.title ?? '',
        quizSettings: this.quizzes.get(stored.session.quiz_id)?.settings ?? {},
        participants: this.participants
          .filter((participant) => participant.session_id === stored.session.id)
          .map((participant) => ({
            id: participant.id,
            displayName: participant.display_name,
            elo: participant.elo,
            joinedAtMs: Date.parse(participant.joined_at),
            tokenHash: participant.rejoin_token_hash ?? '',
            devices: participant.devices,
          })),
      }));
  }

  async listExamAttempts(sessionId: string): Promise<ExamAttemptRecord[]> {
    return this.examAttempts
      .filter((attempt) => attempt.sessionId === sessionId)
      .map((attempt) => ({ ...attempt }));
  }

  async createExamAttempt(attempt: ExamAttemptRecord): Promise<ExamAttemptRecord> {
    const existing = this.examAttempts.find(
      (candidate) =>
        candidate.sessionId === attempt.sessionId &&
        candidate.participantId === attempt.participantId,
    );
    if (existing) {
      return { ...existing };
    }
    this.examAttempts.push({ ...attempt });
    return { ...attempt };
  }

  async submitExamAttempt(attemptId: string, submittedAtMs: number): Promise<boolean> {
    const attempt = this.examAttempts.find((candidate) => candidate.id === attemptId);
    if (!attempt || attempt.submittedAtMs !== null) {
      return false;
    }
    attempt.submittedAtMs = submittedAtMs;
    return true;
  }

  async upsertExamAnswer(answer: ExamAnswerRecord) {
    const existing = this.examAnswers.find(
      (candidate) =>
        candidate.attemptId === answer.attemptId && candidate.questionId === answer.questionId,
    );
    if (existing) {
      existing.chosenOriginalIndex = answer.chosenOriginalIndex;
      existing.savedAtMs = answer.savedAtMs;
    } else {
      this.examAnswers.push({ ...answer });
    }
  }

  async listExamAnswers(attemptId: string): Promise<ExamAnswerRecord[]> {
    return this.examAnswers
      .filter((answer) => answer.attemptId === attemptId)
      .map((answer) => ({ ...answer }));
  }

  async insertProctorEvents(events: ProctorEventRecord[]) {
    if (this.failProctorInsertsRemaining > 0) {
      this.failProctorInsertsRemaining -= 1;
      throw new Error('simulated proctor insert failure');
    }
    this.proctorEvents.push(...events.map((event) => ({ ...event })));
  }

  async listProctorEvents(sessionId: string): Promise<ProctorEventRecord[]> {
    return this.proctorEvents
      .filter((event) => event.sessionId === sessionId)
      .sort(
        (first, second) =>
          first.serverAt - second.serverAt ||
          first.clientAt - second.clientAt ||
          first.id.localeCompare(second.id),
      );
  }

  async listParticipantNames(sessionId: string) {
    return this.participants
      .filter((participant) => participant.session_id === sessionId)
      .map((participant) => ({ id: participant.id, displayName: participant.display_name }));
  }

  async setResultsReleased(sessionId: string, releasedAtMs: number): Promise<number> {
    const stored = this.sessions.get(sessionId);
    if (!stored) {
      return releasedAtMs;
    }
    if (stored.session.results_released_at === null) {
      stored.session = {
        ...stored.session,
        results_released_at: new Date(releasedAtMs).toISOString(),
      };
    }
    return Date.parse(stored.session.results_released_at as string);
  }

  async endAllNonEndedSessions(endedAtIso: string) {
    for (const stored of this.sessions.values()) {
      if (stored.session.status !== 'ended' && stored.session.exam_duration_minutes === null) {
        stored.session = { ...stored.session, status: 'ended', ended_at: endedAtIso };
      }
    }
  }
}
