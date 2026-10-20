import {
  proctorEventRecordSchema,
  participantSchema,
  sessionSchema,
  type Difficulty,
  type Participant,
  type ProctorEventRecord,
  type Session,
} from '@quizup/shared';
import { supabaseAdmin } from '../supabaseAdmin.js';
import type {
  LiveQuestion,
  LiveRepository,
  NewParticipantInput,
  NewResponseInput,
  ExamAnswerRecord,
  ExamAttemptRecord,
  OpenExamSession,
  SessionAnalyticsSource,
  SessionUpdate,
  SummaryRecord,
} from './types.js';

const UNIQUE_VIOLATION_CODE = '23505';
const PAGE_SIZE = 1000;
const EXAM_REHYDRATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  answers_count?: number;
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
    answersCount: Number(row.answers_count ?? 0),
  };
}

const QUESTION_COLUMNS =
  'id, stem, options, correct_index, topic, difficulty, elo_rating, answers_count';

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

interface AttemptRow {
  id: string;
  session_id: string;
  participant_id: string;
  consent_at: string;
  consent_version: string;
  started_at: string;
  deadline_at: string;
  submitted_at: string | null;
  shuffle_seed: number | string;
  question_order: string[];
  option_orders: Record<string, number[]>;
}

function toAttemptRecord(row: AttemptRow): ExamAttemptRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    participantId: row.participant_id,
    consentAtMs: Date.parse(row.consent_at),
    consentVersion: row.consent_version,
    startedAtMs: Date.parse(row.started_at),
    deadlineAtMs: Date.parse(row.deadline_at),
    submittedAtMs: row.submitted_at ? Date.parse(row.submitted_at) : null,
    shuffleSeed: Number(row.shuffle_seed),
    questionOrder: row.question_order,
    optionOrders: row.option_orders,
  };
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
    examDurationMinutes: number | null;
  }): Promise<Session | null> {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .insert({
        quiz_id: input.quizId,
        join_code: input.joinCode,
        question_ids: input.questionIds,
        exam_duration_minutes: input.examDurationMinutes,
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
      .select('*, quizzes(host_id, title, settings)')
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
        user_id: input.userId ?? null,
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
            answers_count: number | null;
          }>((from, to) =>
            supabaseAdmin
              .from('questions')
              .select('id, stem, options, topic, difficulty, answers_count')
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

    const proctorRows =
      record.session.exam_duration_minutes === null
        ? []
        : await fetchAllPages<{ participant_id: string; type: string }>((from, to) =>
            supabaseAdmin
              .from('proctor_events')
              .select('participant_id, type')
              .eq('session_id', sessionId)
              .range(from, to),
          );

    return {
      session: record.session,
      hostId: record.hostId,
      proctorEvents: proctorRows.map((row) => ({
        participantId: row.participant_id,
        type: row.type,
      })),
      participants: participantRows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        elo: Number(row.elo),
        joinedAtMs: Date.parse(row.joined_at),
      })),
      questions: questionRows.map((row) => ({
        id: row.id,
        stem: row.stem,
        options: row.options,
        topic: row.topic,
        difficulty: row.difficulty,
        answersCount: Number(row.answers_count ?? 0),
      })),
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

  async listQuizSessions(quizId: string) {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*, participants(count)')
      .eq('quiz_id', quizId);
    throwUnexpected(error);
    return (
      (data ?? []) as ({ analytics_summary: unknown; participants: { count: number }[] } & Record<
        string,
        unknown
      >)[]
    ).map((row) => ({
      session: sessionSchema.parse(row),
      participantCount: row.participants[0]?.count ?? 0,
      summary: row.analytics_summary ?? null,
    }));
  }

  async listSessionsForHost(hostId: string) {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*, quizzes!inner(host_id)')
      .eq('quizzes.host_id', hostId);
    throwUnexpected(error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => sessionSchema.parse(row));
  }

  async listFeedbackRatings(sessionIds: string[]) {
    if (sessionIds.length === 0) {
      return [];
    }
    const { data, error } = await supabaseAdmin
      .from('session_feedback')
      .select('session_id, rating')
      .in('session_id', sessionIds);
    throwUnexpected(error);
    return ((data ?? []) as { session_id: string; rating: number }[]).map((row) => ({
      sessionId: row.session_id,
      rating: row.rating,
    }));
  }

  async listParticipationsForUser(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('participants')
      .select('id, session_id, sessions(*, quizzes(title, settings))')
      .eq('user_id', userId);
    throwUnexpected(error);
    const rows = (data ?? []) as unknown as {
      id: string;
      session_id: string;
      sessions:
        | ({
            analytics_summary: unknown;
            quizzes: { title: string; settings: unknown } | null;
          } & Record<string, unknown>)
        | null;
    }[];
    const sessionIds = [...new Set(rows.map((row) => row.session_id))];
    const counts = new Map<string, number>();
    if (sessionIds.length > 0) {
      const everyone = await fetchAllPages<{ session_id: string }>((from, to) =>
        supabaseAdmin
          .from('participants')
          .select('session_id')
          .in('session_id', sessionIds)
          .range(from, to),
      );
      for (const participant of everyone) {
        counts.set(participant.session_id, (counts.get(participant.session_id) ?? 0) + 1);
      }
    }
    return rows.flatMap((row) => {
      if (!row.sessions?.quizzes) {
        return [];
      }
      return [
        {
          session: sessionSchema.parse(row.sessions),
          quizTitle: row.sessions.quizzes.title,
          quizSettings: row.sessions.quizzes.settings,
          participantId: row.id,
          participantCount: counts.get(row.session_id) ?? 0,
          summary: row.sessions.analytics_summary ?? null,
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
    const { error } = await supabaseAdmin.from('session_feedback').upsert(
      {
        session_id: input.sessionId,
        participant_id: input.participantId,
        rating: input.rating,
        comment: input.comment,
      },
      { onConflict: 'session_id,participant_id' },
    );
    throwUnexpected(error);
  }

  async listSessionFeedback(sessionId: string) {
    const { data, error } = await supabaseAdmin
      .from('session_feedback')
      .select('participant_id, rating, comment, created_at, participants(display_name)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    throwUnexpected(error);
    return (
      (data ?? []) as unknown as {
        participant_id: string;
        rating: number;
        comment: string | null;
        created_at: string;
        participants: { display_name: string } | null;
      }[]
    ).map((row) => ({
      participantId: row.participant_id,
      displayName: row.participants?.display_name ?? 'Student',
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
    }));
  }

  async listOpenExamSessions(): Promise<OpenExamSession[]> {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*, quizzes(host_id)')
      .not('exam_duration_minutes', 'is', null)
      .or(
        `status.neq.ended,ended_at.gt.${new Date(Date.now() - EXAM_REHYDRATE_WINDOW_MS).toISOString()}`,
      );
    throwUnexpected(error);

    const opened: OpenExamSession[] = [];
    for (const row of (data ?? []) as {
      quizzes: { host_id: string; title: string; settings: unknown } | null;
    }[]) {
      const { quizzes, ...sessionRow } = row;
      if (!quizzes) {
        continue;
      }
      const session = sessionSchema.parse(sessionRow);
      const participantRows = await fetchAllPages<{
        id: string;
        display_name: string;
        elo: number;
        joined_at: string;
        rejoin_token_hash: string | null;
      }>((from, to) =>
        supabaseAdmin
          .from('participants')
          .select('id, display_name, elo, joined_at, rejoin_token_hash')
          .eq('session_id', session.id)
          .range(from, to),
      );
      opened.push({
        session,
        hostId: quizzes.host_id,
        quizTitle: quizzes.title,
        quizSettings: quizzes.settings,
        participants: participantRows.map((participant) => ({
          id: participant.id,
          displayName: participant.display_name,
          elo: Number(participant.elo),
          joinedAtMs: Date.parse(participant.joined_at),
          tokenHash: participant.rejoin_token_hash ?? '',
        })),
      });
    }
    return opened;
  }

  async listExamAttempts(sessionId: string): Promise<ExamAttemptRecord[]> {
    const rows = await fetchAllPages<AttemptRow>((from, to) =>
      supabaseAdmin.from('exam_attempts').select('*').eq('session_id', sessionId).range(from, to),
    );
    return rows.map(toAttemptRecord);
  }

  async createExamAttempt(attempt: ExamAttemptRecord): Promise<ExamAttemptRecord> {
    const { data, error } = await supabaseAdmin
      .from('exam_attempts')
      .insert({
        id: attempt.id,
        session_id: attempt.sessionId,
        participant_id: attempt.participantId,
        consent_at: new Date(attempt.consentAtMs).toISOString(),
        consent_version: attempt.consentVersion,
        started_at: new Date(attempt.startedAtMs).toISOString(),
        deadline_at: new Date(attempt.deadlineAtMs).toISOString(),
        shuffle_seed: attempt.shuffleSeed,
        question_order: attempt.questionOrder,
        option_orders: attempt.optionOrders,
      })
      .select('*')
      .single();
    if (error?.code === UNIQUE_VIOLATION_CODE) {
      const existing = await supabaseAdmin
        .from('exam_attempts')
        .select('*')
        .eq('session_id', attempt.sessionId)
        .eq('participant_id', attempt.participantId)
        .single();
      throwUnexpected(existing.error);
      return toAttemptRecord(existing.data as AttemptRow);
    }
    throwUnexpected(error);
    return toAttemptRecord(data as AttemptRow);
  }

  async submitExamAttempt(attemptId: string, submittedAtMs: number): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('exam_attempts')
      .update({ submitted_at: new Date(submittedAtMs).toISOString() })
      .eq('id', attemptId)
      .is('submitted_at', null)
      .select('id');
    throwUnexpected(error);
    return (data ?? []).length > 0;
  }

  async upsertExamAnswer(answer: ExamAnswerRecord) {
    const { error } = await supabaseAdmin.from('exam_answers').upsert(
      {
        attempt_id: answer.attemptId,
        question_id: answer.questionId,
        chosen_original_index: answer.chosenOriginalIndex,
        saved_at: new Date(answer.savedAtMs).toISOString(),
      },
      { onConflict: 'attempt_id,question_id' },
    );
    throwUnexpected(error);
  }

  async listExamAnswers(attemptId: string): Promise<ExamAnswerRecord[]> {
    const rows = await fetchAllPages<{
      attempt_id: string;
      question_id: string;
      chosen_original_index: number;
      saved_at: string;
    }>((from, to) =>
      supabaseAdmin.from('exam_answers').select('*').eq('attempt_id', attemptId).range(from, to),
    );
    return rows.map((row) => ({
      attemptId: row.attempt_id,
      questionId: row.question_id,
      chosenOriginalIndex: row.chosen_original_index,
      savedAtMs: Date.parse(row.saved_at),
    }));
  }

  async insertProctorEvents(events: ProctorEventRecord[]) {
    if (events.length === 0) {
      return;
    }
    const { error } = await supabaseAdmin.from('proctor_events').insert(
      events.map((event) => ({
        id: event.id,
        session_id: event.sessionId,
        participant_id: event.participantId,
        attempt_id: event.attemptId,
        type: event.type,
        client_at: new Date(event.clientAt).toISOString(),
        server_at: new Date(event.serverAt).toISOString(),
        late: event.late,
        detail: event.detail ?? {},
      })),
    );
    throwUnexpected(error);
  }

  async listProctorEvents(sessionId: string): Promise<ProctorEventRecord[]> {
    const rows = await fetchAllPages<{
      id: string;
      session_id: string;
      participant_id: string;
      attempt_id: string;
      type: string;
      client_at: string | null;
      server_at: string;
      late: boolean;
      detail: Record<string, unknown> | null;
    }>((from, to) =>
      supabaseAdmin
        .from('proctor_events')
        .select(
          'id, session_id, participant_id, attempt_id, type, client_at, server_at, late, detail',
        )
        .eq('session_id', sessionId)
        .order('server_at', { ascending: true })
        .order('client_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    );
    return rows.flatMap((row) => {
      const parsed = proctorEventRecordSchema.safeParse({
        id: row.id,
        sessionId: row.session_id,
        participantId: row.participant_id,
        attemptId: row.attempt_id,
        type: row.type,
        clientAt: row.client_at ? Date.parse(row.client_at) : Date.parse(row.server_at),
        serverAt: Date.parse(row.server_at),
        late: row.late,
        detail: row.detail && Object.keys(row.detail).length > 0 ? row.detail : null,
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  async listParticipantNames(sessionId: string) {
    const rows = await fetchAllPages<{ id: string; display_name: string }>((from, to) =>
      supabaseAdmin
        .from('participants')
        .select('id, display_name')
        .eq('session_id', sessionId)
        .range(from, to),
    );
    return rows.map((row) => ({ id: row.id, displayName: row.display_name }));
  }

  async setResultsReleased(sessionId: string, releasedAtMs: number): Promise<number> {
    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ results_released_at: new Date(releasedAtMs).toISOString() })
      .eq('id', sessionId)
      .is('results_released_at', null);
    throwUnexpected(error);
    const { data, error: readError } = await supabaseAdmin
      .from('sessions')
      .select('results_released_at')
      .eq('id', sessionId)
      .single();
    throwUnexpected(readError);
    const stored = (data as { results_released_at: string | null }).results_released_at;
    return stored ? Date.parse(stored) : releasedAtMs;
  }

  async endAllNonEndedSessions(endedAtIso: string) {
    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ status: 'ended', ended_at: endedAtIso })
      .neq('status', 'ended')
      .is('exam_duration_minutes', null);
    throwUnexpected(error);
  }
}
