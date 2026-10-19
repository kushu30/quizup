import { participantSchema, sessionSchema, type Participant, type Session } from '@quizup/shared';
import { supabaseAdmin } from '../supabaseAdmin.js';
import type {
  LiveQuestion,
  LiveRepository,
  NewParticipantInput,
  NewResponseInput,
  SessionUpdate,
} from './types.js';

const UNIQUE_VIOLATION_CODE = '23505';

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

function throwUnexpected(error: SupabaseErrorLike | null) {
  if (error) {
    throw new Error(error.message);
  }
}

interface QuestionRow {
  id: string;
  stem: string;
  options: string[];
  correct_index: number;
}

export class SupabaseLiveRepository implements LiveRepository {
  async findOwnedQuiz(quizId: string, hostId: string) {
    const { data, error } = await supabaseAdmin
      .from('quizzes')
      .select('id, title')
      .eq('id', quizId)
      .eq('host_id', hostId)
      .maybeSingle();
    throwUnexpected(error);
    return data ? { id: String(data.id), title: String(data.title) } : null;
  }

  async listApprovedQuestions(quizId: string): Promise<LiveQuestion[]> {
    const { data, error } = await supabaseAdmin
      .from('questions')
      .select('id, stem, options, correct_index')
      .eq('quiz_id', quizId)
      .eq('approved', true);
    throwUnexpected(error);
    return ((data ?? []) as QuestionRow[]).map((row) => ({
      id: row.id,
      stem: row.stem,
      options: row.options,
      correctIndex: row.correct_index,
    }));
  }

  async loadQuestionsByIds(questionIds: string[]) {
    if (questionIds.length === 0) {
      return [];
    }
    const { data, error } = await supabaseAdmin
      .from('questions')
      .select('id, stem, options, correct_index, approved')
      .in('id', questionIds);
    throwUnexpected(error);
    return ((data ?? []) as (QuestionRow & { approved: boolean })[]).map((row) => ({
      id: row.id,
      stem: row.stem,
      options: row.options,
      correctIndex: row.correct_index,
      approved: row.approved === true,
    }));
  }

  async createSession(input: {
    quizId: string;
    joinCode: string;
    questionIds: string[];
  }): Promise<Session | null> {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .insert({
        quiz_id: input.quizId,
        join_code: input.joinCode,
        question_ids: input.questionIds,
      })
      .select('*')
      .single();
    if (error?.code === UNIQUE_VIOLATION_CODE) {
      return null;
    }
    throwUnexpected(error);
    return sessionSchema.parse(data);
  }

  async findSessionWithHost(sessionId: string) {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*, quizzes(host_id)')
      .eq('id', sessionId)
      .maybeSingle();
    throwUnexpected(error);
    if (!data) {
      return null;
    }
    const { quizzes, ...sessionRow } = data as { quizzes: { host_id: string } | null };
    return quizzes ? { session: sessionSchema.parse(sessionRow), hostId: quizzes.host_id } : null;
  }

  async updateSession(sessionId: string, update: SessionUpdate) {
    const { error } = await supabaseAdmin.from('sessions').update(update).eq('id', sessionId);
    throwUnexpected(error);
  }

  async insertParticipant(input: NewParticipantInput): Promise<Participant | 'name_taken'> {
    const { data, error } = await supabaseAdmin
      .from('participants')
      .insert({
        session_id: input.sessionId,
        display_name: input.displayName,
        rejoin_token_hash: input.rejoinTokenHash,
      })
      .select('*')
      .single();
    if (error?.code === UNIQUE_VIOLATION_CODE) {
      return 'name_taken';
    }
    throwUnexpected(error);
    return participantSchema.parse(data);
  }

  async insertResponse(input: NewResponseInput): Promise<'inserted' | 'duplicate'> {
    const { error } = await supabaseAdmin.from('responses').insert({
      session_id: input.sessionId,
      participant_id: input.participantId,
      question_id: input.questionId,
      chosen_index: input.chosenIndex,
      correct: input.correct,
      response_ms: input.responseMs,
      points: input.points,
      served_at: input.servedAtIso,
      answered_at: input.answeredAtIso,
    });
    if (error?.code === UNIQUE_VIOLATION_CODE) {
      return 'duplicate';
    }
    throwUnexpected(error);
    return 'inserted';
  }

  async endAllNonEndedSessions(endedAtIso: string) {
    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ status: 'ended', ended_at: endedAtIso })
      .neq('status', 'ended');
    throwUnexpected(error);
  }
}
