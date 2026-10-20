import {
  analyticsSnapshotSchema,
  apiErrorSchema,
  approveQuestionsResultSchema,
  questionMoveResultSchema,
  type QuestionMoveResult,
  proctorTimelineResponseSchema,
  releaseResultsResponseSchema,
  csvImportResultSchema,
  questionListSchema,
  sessionSummarySchema,
  quizWithCountListSchema,
  quizSchema,
  questionSchema,
  topicListSchema,
  type AnalyticsSnapshot,
  type ApproveQuestionsResult,
  type ExportType,
  type ProctorParticipantTimeline,
  type ReleaseResultsResponse,
  type CsvImportResult,
  type GenerateQuestionsInput,
  type Question,
  type QuestionBankQuery,
  type QuestionInput,
  type QuestionUpdateInput,
  type Quiz,
  type QuizCreateInput,
  type QuizUpdateInput,
  type QuizWithCount,
  type RowError,
  type SessionCreateInput,
  type SessionSummary,
  sessionFeedbackResponseSchema,
  type SessionFeedbackResponse,
  myResultsSchema,
  quizActivityListSchema,
  type QuizActivity,
  quizSessionHistorySchema,
  type MyResultRow,
  type QuizSessionHistoryRow,
  allowRejoinResponseSchema,
  hostAccessSentSchema,
  rosterEmailPreviewSchema,
  rosterEmailResultSchema,
  rosterEmailTestResultSchema,
  type RosterEmailPreview,
  type RosterEmailPreviewPayload,
  type RosterEmailResult,
  type RosterEmailTestResult,
  rosterAddResponseSchema,
  rosterReissueResponseSchema,
  rosterResponseSchema,
  type AllowRejoinResponse,
  type RosterAddResponse,
  type RosterReissueResponse,
  type RosterResponse,
  type RosterStudentInput,
  type SessionStartInput,
  groupDetailSchema,
  groupListSchema,
  type GroupDetail,
  type GroupSaveInput,
  type GroupSummary,
} from '@quizup/shared';
import { webEnv } from './env';
import { supabase } from './supabase';

interface Parser<Parsed> {
  parse: (value: unknown) => Parsed;
}

export class ApiError extends Error {
  readonly rowErrors: RowError[];
  readonly status: number;
  readonly code: string | null;

  constructor(
    message: string,
    options: { rowErrors?: RowError[]; status?: number; code?: string | null } = {},
  ) {
    super(message);
    this.rowErrors = options.rowErrors ?? [];
    this.status = options.status ?? 0;
    this.code = options.code ?? null;
  }
}

async function sendRequest(path: string, method: string, body?: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new ApiError('You are signed out');
  }

  const response = await fetch(`${webEnv.VITE_SERVER_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(await response.json().catch(() => null));
    if (!parsedError.success) {
      throw new ApiError(`Request failed (${response.status})`, { status: response.status });
    }
    const { error, issues, message, summary, rowErrors } = parsedError.data;
    const detail = issues?.map((issue) => issue.message).join('; ') || message || error;
    throw new ApiError(summary ? `${detail} (${summary})` : detail, {
      rowErrors,
      status: response.status,
      code: error,
    });
  }
  return response;
}

async function requestJson<Parsed>(
  path: string,
  method: string,
  parser: Parser<Parsed>,
  body?: unknown,
): Promise<Parsed> {
  const response = await sendRequest(path, method, body);
  return parser.parse(await response.json());
}

async function requestNoContent(path: string, method: string, body?: unknown): Promise<void> {
  await sendRequest(path, method, body);
}

function buildQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const api = {
  listQuizzes: (): Promise<QuizWithCount[]> =>
    requestJson('/quizzes', 'GET', quizWithCountListSchema),
  getQuiz: (quizId: string): Promise<Quiz> => requestJson(`/quizzes/${quizId}`, 'GET', quizSchema),
  createQuiz: (input: QuizCreateInput): Promise<Quiz> =>
    requestJson('/quizzes', 'POST', quizSchema, input),
  updateQuiz: (quizId: string, changes: QuizUpdateInput): Promise<Quiz> =>
    requestJson(`/quizzes/${quizId}`, 'PATCH', quizSchema, changes),
  deleteQuiz: (quizId: string): Promise<void> => requestNoContent(`/quizzes/${quizId}`, 'DELETE'),

  listQuestions: (query: QuestionBankQuery): Promise<Question[]> =>
    requestJson(`/questions${buildQueryString({ ...query })}`, 'GET', questionListSchema),
  listTopics: (quizId?: string): Promise<string[]> =>
    requestJson(`/questions/topics${buildQueryString({ quizId })}`, 'GET', topicListSchema),
  createQuestion: (quizId: string, input: QuestionInput): Promise<Question> =>
    requestJson(`/quizzes/${quizId}/questions`, 'POST', questionSchema, input),
  updateQuestion: (questionId: string, changes: QuestionUpdateInput): Promise<Question> =>
    requestJson(`/questions/${questionId}`, 'PATCH', questionSchema, changes),
  deleteQuestion: (questionId: string): Promise<void> =>
    requestNoContent(`/questions/${questionId}`, 'DELETE'),
  generateQuestions: (quizId: string, input: GenerateQuestionsInput): Promise<Question[]> =>
    requestJson(`/quizzes/${quizId}/generate-questions`, 'POST', questionListSchema, input),
  reorderQuestions: (quizId: string, questionIds: string[]): Promise<void> =>
    requestNoContent(`/quizzes/${quizId}/questions/order`, 'POST', { questionIds }),
  moveQuestions: (questionIds: string[], topic: string): Promise<QuestionMoveResult> =>
    requestJson('/questions/move', 'POST', questionMoveResultSchema, { questionIds, topic }),
  approveQuestion: (questionId: string): Promise<Question> =>
    requestJson(`/questions/${questionId}/approve`, 'POST', questionSchema),
  unapproveQuestion: (questionId: string): Promise<Question> =>
    requestJson(`/questions/${questionId}/unapprove`, 'POST', questionSchema),
  approveQuestions: (quizId: string, questionIds: string[]): Promise<ApproveQuestionsResult> =>
    requestJson(`/quizzes/${quizId}/questions/approve`, 'POST', approveQuestionsResultSchema, {
      questionIds,
    }),
  getSessionSummary: (sessionId: string): Promise<AnalyticsSnapshot> =>
    requestJson(`/sessions/${sessionId}/summary`, 'GET', analyticsSnapshotSchema),
  downloadExport: async (sessionId: string, type: ExportType): Promise<Blob> => {
    const response = await sendRequest(`/sessions/${sessionId}/export.csv?type=${type}`, 'GET');
    return response.blob();
  },
  releaseResults: (sessionId: string): Promise<ReleaseResultsResponse> =>
    requestJson(`/sessions/${sessionId}/release-results`, 'POST', releaseResultsResponseSchema),
  getProctorTimeline: (sessionId: string): Promise<ProctorParticipantTimeline[]> =>
    requestJson(`/sessions/${sessionId}/proctor`, 'GET', proctorTimelineResponseSchema),
  listQuizSessions: (quizId: string): Promise<QuizSessionHistoryRow[]> =>
    requestJson(`/quizzes/${quizId}/sessions`, 'GET', quizSessionHistorySchema),
  getMyResults: (): Promise<MyResultRow[]> => requestJson('/me/results', 'GET', myResultsSchema),
  getQuizActivity: (): Promise<QuizActivity[]> =>
    requestJson('/me/quiz-activity', 'GET', quizActivityListSchema),
  getSessionFeedback: (sessionId: string): Promise<SessionFeedbackResponse> =>
    requestJson(`/sessions/${sessionId}/feedback`, 'GET', sessionFeedbackResponseSchema),
  getRoster: (sessionId: string): Promise<RosterResponse> =>
    requestJson(`/sessions/${sessionId}/roster`, 'GET', rosterResponseSchema),
  addRoster: (sessionId: string, students: RosterStudentInput[]): Promise<RosterAddResponse> =>
    requestJson(`/sessions/${sessionId}/roster`, 'POST', rosterAddResponseSchema, { students }),
  reissueRosterToken: (sessionId: string, rosterId: string): Promise<RosterReissueResponse> =>
    requestJson(
      `/sessions/${sessionId}/roster/${rosterId}/reissue`,
      'POST',
      rosterReissueResponseSchema,
    ),
  removeRosterEntry: (sessionId: string, rosterId: string): Promise<void> =>
    requestNoContent(`/sessions/${sessionId}/roster/${rosterId}`, 'DELETE'),
  emailRosterTokens: (
    sessionId: string,
    rosterIds?: string[],
    custom: { subject?: string; message?: string } = {},
  ): Promise<RosterEmailResult> =>
    requestJson(`/sessions/${sessionId}/roster/email`, 'POST', rosterEmailResultSchema, {
      ...(rosterIds ? { rosterIds } : {}),
      ...custom,
    }),
  previewRosterEmail: (
    sessionId: string,
    payload: RosterEmailPreviewPayload,
  ): Promise<RosterEmailPreview> =>
    requestJson(
      `/sessions/${sessionId}/roster/email/preview`,
      'POST',
      rosterEmailPreviewSchema,
      payload,
    ),
  testRosterEmail: (
    sessionId: string,
    payload: RosterEmailPreviewPayload,
  ): Promise<RosterEmailTestResult> =>
    requestJson(
      `/sessions/${sessionId}/roster/email/test`,
      'POST',
      rosterEmailTestResultSchema,
      payload,
    ),
  listGroups: (): Promise<GroupSummary[]> => requestJson('/groups', 'GET', groupListSchema),
  getGroup: (groupId: string): Promise<GroupDetail> =>
    requestJson(`/groups/${groupId}`, 'GET', groupDetailSchema),
  createGroup: (input: GroupSaveInput): Promise<GroupDetail> =>
    requestJson('/groups', 'POST', groupDetailSchema, input),
  updateGroup: (groupId: string, input: GroupSaveInput): Promise<GroupDetail> =>
    requestJson(`/groups/${groupId}`, 'PUT', groupDetailSchema, input),
  deleteGroup: (groupId: string): Promise<void> => requestNoContent(`/groups/${groupId}`, 'DELETE'),
  notifyHostAccess: async (email: string): Promise<void> => {
    await requestJson('/admin/host-access/notify', 'POST', hostAccessSentSchema, { email });
  },
  allowRejoin: (sessionId: string, participantId: string): Promise<AllowRejoinResponse> =>
    requestJson(
      `/sessions/${sessionId}/participants/${participantId}/allow-rejoin`,
      'POST',
      allowRejoinResponseSchema,
    ),
  getSession: (sessionId: string): Promise<SessionSummary> =>
    requestJson(`/sessions/${sessionId}`, 'GET', sessionSummarySchema),
  createSession: (input: SessionCreateInput): Promise<SessionSummary> =>
    requestJson('/sessions', 'POST', sessionSummarySchema, input),
  startSession: (sessionId: string, options: SessionStartInput = {}): Promise<SessionSummary> =>
    requestJson(`/sessions/${sessionId}/start`, 'POST', sessionSummarySchema, options),
  nextQuestion: (sessionId: string): Promise<SessionSummary> =>
    requestJson(`/sessions/${sessionId}/next`, 'POST', sessionSummarySchema),
  endSession: (sessionId: string): Promise<SessionSummary> =>
    requestJson(`/sessions/${sessionId}/end`, 'POST', sessionSummarySchema),
  importQuestions: (quizId: string, csv: string): Promise<CsvImportResult> =>
    requestJson(`/quizzes/${quizId}/questions/import`, 'POST', csvImportResultSchema, { csv }),
};

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
