import {
  participantSchema,
  sessionSchema,
  type Difficulty,
  type Participant,
  type Session,
} from '@quizup/shared';
import { supabaseAdmin } from '../supabaseAdmin.js';
import type {
  LiveQuestion,
  LiveRepository,
  NewParticipantInput,
  NewResponseInput,
  SessionAnalyticsSource,
  SessionUpdate,
  SummaryRecord,
} from './types.js';

const UNIQUE_VIOLATION_CODE = '23505';
const PAGE_SIZE = 1000;

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
  topic: string;
  difficulty: Difficulty;
  elo_rating: number;
}

function toLiveQuestion(row: QuestionRow): LiveQuestion {
  return {
    id: row.id,
    stem: row.stem,
    options: row.options,
    correctIndex: row.correct_index,
    topic: row.topic,
    difficulty: row.difficulty,
    eloRating: row.elo_rating,
  };
}

const QUESTION_COLUMNS = 'id, stem, options, correct_index, topic, difficulty, elo_rating';

async function fetchAllPages<Row>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: SupabaseErrorLike | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    throwUnexpected(error);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

export class SupabaseLiveRepository implements LiveRepository {
  async findOwnedQuiz(quizId: string, hostId: string) {
    const { data, error } = await supabaseAdmin
      .from('quizzes')
      .select('id, title, settings')
      .eq('id', quizId)
      .eq('host_id', hostId)
      .maybeSingle();
    throwUnexpected(error);
    return data
      ? { id: String(data.id), title: String(data.title), settings: data.settings }
      : null;
  }

  async listApprovedQuestions(quizId: string): Promise<LiveQuestion[]> {
    const { data, error } = await supabaseAdmin
      .from('questions')
      .select(QUESTION_COLUMNS)
      .eq('quiz_id', quizId)
      .eq('approved', true);
    throwUnexpected(error);
    return ((data ?? []) as QuestionRow[]).map(toLiveQuestion);
  }

  async loadQuestionsByIds(questionIds: string[]) {
    if (questionIds.length === 0) {
      return [];
    }
    const { data, error } = await supabaseAdmin
      .from('questions')
      .select(`${QUESTION_COLUMNS}, approved`)
      .in('id', questionIds);
    throwUnexpected(error);
    return ((data ?? []) as (QuestionRow & { approved: boolean })[]).map((row) => ({
      ...toLiveQuestion(row),
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

  async recordResponseRatings(input: {
    participantId: string;
    questionId: string;
    participantEloBefore: number;
    questionEloBefore: number;
  }) {
    const { error } = await supabaseAdmin
      .from('responses')
      .update({
        participant_elo_before: input.participantEloBefore,
        question_elo_before: input.questionEloBefore,
      })
      .eq('participant_id', input.participantId)
      .eq('question_id', input.questionId);
    throwUnexpected(error);
  }

  async applyQuestionRatingDelta(questionId: string, delta: number) {
    const { data, error } = await supabaseAdmin.rpc('apply_question_rating_delta', {
      target_question_id: questionId,
      rating_delta: delta,
    });
    throwUnexpected(error);
    return Number(data);
  }

  async updateParticipantElo(participantId: string, elo: number) {
    const { error } = await supabaseAdmin
      .from('participants')
      .update({ elo })
      .eq('id', participantId);
    throwUnexpected(error);
  }

  async upsertKnowledgeState(input: { participantId: string; topic: string; pMastery: number }) {
    const { error } = await supabaseAdmin.from('knowledge_states').upsert(
      {
        participant_id: input.participantId,
        topic: input.topic,
        p_mastery: input.pMastery,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'participant_id,topic' },
    );
    throwUnexpected(error);
  }

  async findSummaryRecord(sessionId: string): Promise<SummaryRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*, quizzes(host_id)')
      .eq('id', sessionId)
      .maybeSingle();
    throwUnexpected(error);
    if (!data) {
      return null;
    }
    const {
      quizzes,
      analytics_summary: storedSummary,
      ...sessionRow
    } = data as {
      quizzes: { host_id: string } | null;
      analytics_summary: unknown;
    };
    return quizzes
      ? {
          session: sessionSchema.parse(sessionRow),
          hostId: quizzes.host_id,
          storedSummary: storedSummary ?? null,
        }
      : null;
  }

  async saveSessionSummary(sessionId: string, summary: unknown, generatedAtIso: string) {
    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ analytics_summary: summary, summary_generated_at: generatedAtIso })
      .eq('id', sessionId)
      .is('analytics_summary', null);
    throwUnexpected(error);
  }

  async loadSessionAnalyticsSource(sessionId: string): Promise<SessionAnalyticsSource | null> {
    const record = await this.findSummaryRecord(sessionId);
    if (!record) {
      return null;
    }

    const participantRows = await fetchAllPages<{
      id: string;
      display_name: string;
      elo: number;
      joined_at: string;
    }>((from, to) =>
      supabaseAdmin
        .from('participants')
        .select('id, display_name, elo, joined_at')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true })
        .range(from, to),
    );
    const responseRows = await fetchAllPages<{
      participant_id: string;
      question_id: string;
      chosen_index: number;
      correct: boolean;
      response_ms: number;
      points: number;
      answered_at: string;
      participant_elo_before: number | null;
      question_elo_before: number | null;
    }>((from, to) =>
      supabaseAdmin
        .from('responses')
        .select(
          'participant_id, question_id, chosen_index, correct, response_ms, points, answered_at, participant_elo_before, question_elo_before',
        )
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true })
        .range(from, to),
    );

    const questionIds = [
      ...new Set([...record.session.question_ids, ...responseRows.map((row) => row.question_id)]),
    ];
    const questionRows =
      questionIds.length === 0
        ? []
        : await fetchAllPages<{
            id: string;
            stem: string;
            options: string[];
            topic: string;
            difficulty: Difficulty;
          }>((from, to) =>
            supabaseAdmin
              .from('questions')
              .select('id, stem, options, topic, difficulty')
              .in('id', questionIds)
              .range(from, to),
          );
    const participantIds = participantRows.map((row) => row.id);
    const knowledgeRows =
      participantIds.length === 0
        ? []
        : await fetchAllPages<{ participant_id: string; topic: string; p_mastery: number }>(
            (from, to) =>
              supabaseAdmin
                .from('knowledge_states')
                .select('participant_id, topic, p_mastery')
                .in('participant_id', participantIds)
                .range(from, to),
          );

    return {
      session: record.session,
      hostId: record.hostId,
      participants: participantRows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        elo: Number(row.elo),
        joinedAtMs: Date.parse(row.joined_at),
      })),
      questions: questionRows,
      responses: responseRows.map((row) => ({
        participantId: row.participant_id,
        questionId: row.question_id,
        chosenIndex: row.chosen_index,
        correct: row.correct,
        responseMs: row.response_ms,
        points: row.points,
        answeredAtMs: Date.parse(row.answered_at),
        participantEloBefore:
          row.participant_elo_before === null ? null : Number(row.participant_elo_before),
        questionEloBefore:
          row.question_elo_before === null ? null : Number(row.question_elo_before),
      })),
      knowledgeStates: knowledgeRows.map((row) => ({
        participantId: row.participant_id,
        topic: row.topic,
        pMastery: Number(row.p_mastery),
      })),
    };
  }

  async endAllNonEndedSessions(endedAtIso: string) {
    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ status: 'ended', ended_at: endedAtIso })
      .neq('status', 'ended');
    throwUnexpected(error);
  }
}
