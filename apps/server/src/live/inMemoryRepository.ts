import { randomUUID } from 'node:crypto';
import type { Participant, Session } from '@quizup/shared';
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
  questions: (LiveQuestion & { approved: boolean })[];
}

export class InMemoryLiveRepository implements LiveRepository {
  readonly quizzes = new Map<string, StoredQuiz>();
  readonly sessions = new Map<string, { session: Session; hostId: string }>();
  readonly participants: Participant[] = [];
  readonly responses: NewResponseInput[] = [];

  seedQuiz(input: {
    hostId: string;
    title?: string;
    questions: (LiveQuestion & { approved?: boolean })[];
  }): string {
    const id = randomUUID();
    this.quizzes.set(id, {
      id,
      title: input.title ?? 'Seeded quiz',
      hostId: input.hostId,
      questions: input.questions.map((question) => ({
        ...question,
        approved: question.approved ?? true,
      })),
    });
    return id;
  }

  async findOwnedQuiz(quizId: string, hostId: string) {
    const quiz = this.quizzes.get(quizId);
    return quiz && quiz.hostId === hostId ? { id: quiz.id, title: quiz.title } : null;
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
      }));
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

  async endAllNonEndedSessions(endedAtIso: string) {
    for (const stored of this.sessions.values()) {
      if (stored.session.status !== 'ended') {
        stored.session = { ...stored.session, status: 'ended', ended_at: endedAtIso };
      }
    }
  }
}
