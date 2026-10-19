import { randomUUID } from 'node:crypto';
import {
  ELO_MAX_RATING,
  ELO_MIN_RATING,
  initialQuestionRating,
  type Participant,
  type Session,
} from '@quizup/shared';
import type {
  LiveQuestion,
  LiveRepository,
  NewParticipantInput,
  NewResponseInput,
  SessionUpdate,
} from './types.js';

interface StoredQuiz {
  id: string;
  title: string;
  hostId: string;
  settings: unknown;
  questions: (LiveQuestion & { approved: boolean })[];
}

export type SeedQuestion = Pick<LiveQuestion, 'id' | 'stem' | 'options' | 'correctIndex'> &
  Partial<Pick<LiveQuestion, 'topic' | 'difficulty' | 'eloRating'>> & { approved?: boolean };

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
  readonly sessions = new Map<string, { session: Session; hostId: string }>();
  readonly participants: Participant[] = [];
  readonly responses: StoredResponse[] = [];
  readonly knowledgeStates: StoredKnowledgeState[] = [];

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
          approved: question.approved ?? true,
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

  async createSession(input: { quizId: string; joinCode: string; questionIds: string[] }) {
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
      user_id: null,
      display_name: input.displayName,
      elo: 1000,
      joined_at: new Date().toISOString(),
      rejoin_token_hash: input.rejoinTokenHash,
    };
    this.participants.push(participant);
    return participant;
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

  async endAllNonEndedSessions(endedAtIso: string) {
    for (const stored of this.sessions.values()) {
      if (stored.session.status !== 'ended') {
        stored.session = { ...stored.session, status: 'ended', ended_at: endedAtIso };
      }
    }
  }
}
