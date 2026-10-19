import {
  approveQuestionsBodySchema,
  csvImportBodySchema,
  parseQuestionsCsv,
  questionInputSchema,
  quizCreateSchema,
  quizIdParamsSchema,
  quizSchema,
  quizUpdateSchema,
  type Quiz,
  type QuizWithCount,
} from '@quizup/shared';
import { Router } from 'express';
import { getAuthUser, requireAuth, requireRole } from '../auth.js';
import { asyncRoute, parseOrReject, sendNotFound, throwIfSupabaseError } from '../http.js';
import { findOwnedQuiz } from '../ownership.js';
import { supabaseAdmin } from '../supabaseAdmin.js';

export const quizzesRouter = Router();

quizzesRouter.use(requireAuth, requireRole('host', 'admin'));

interface QuizRowWithCount extends Quiz {
  questions: { count: number }[];
}

quizzesRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    const { data, error } = await supabaseAdmin
      .from('quizzes')
      .select('*, questions(count)')
      .eq('host_id', getAuthUser(request).id)
      .order('created_at', { ascending: false });
    throwIfSupabaseError(error);

    const quizzes: QuizWithCount[] = ((data ?? []) as QuizRowWithCount[]).map(
      ({ questions, ...quiz }) => ({
        ...quizSchema.parse(quiz),
        question_count: questions[0]?.count ?? 0,
      }),
    );
    response.json(quizzes);
  }),
);

quizzesRouter.post(
  '/',
  asyncRoute(async (request, response) => {
    const input = parseOrReject(quizCreateSchema, request.body, response);
    if (!input) {
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('quizzes')
      .insert({ ...input, host_id: getAuthUser(request).id })
      .select('*')
      .single();
    throwIfSupabaseError(error);
    response.status(201).json(quizSchema.parse(data));
  }),
);

quizzesRouter.get(
  '/:quizId',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(quizIdParamsSchema, request.params, response);
    if (!params) {
      return;
    }
    const quiz = await findOwnedQuiz(params.quizId, getAuthUser(request).id);
    if (!quiz) {
      sendNotFound(response, 'Quiz');
      return;
    }
    response.json(quiz);
  }),
);

quizzesRouter.patch(
  '/:quizId',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(quizIdParamsSchema, request.params, response);
    const changes = params ? parseOrReject(quizUpdateSchema, request.body, response) : null;
    if (!params || !changes) {
      return;
    }
    const quiz = await findOwnedQuiz(params.quizId, getAuthUser(request).id);
    if (!quiz) {
      sendNotFound(response, 'Quiz');
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('quizzes')
      .update(changes)
      .eq('id', quiz.id)
      .select('*')
      .single();
    throwIfSupabaseError(error);
    response.json(quizSchema.parse(data));
  }),
);

quizzesRouter.delete(
  '/:quizId',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(quizIdParamsSchema, request.params, response);
    if (!params) {
      return;
    }
    const quiz = await findOwnedQuiz(params.quizId, getAuthUser(request).id);
    if (!quiz) {
      sendNotFound(response, 'Quiz');
      return;
    }
    const { error } = await supabaseAdmin.from('quizzes').delete().eq('id', quiz.id);
    throwIfSupabaseError(error);
    response.status(204).end();
  }),
);

quizzesRouter.post(
  '/:quizId/questions',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(quizIdParamsSchema, request.params, response);
    const input = params ? parseOrReject(questionInputSchema, request.body, response) : null;
    if (!params || !input) {
      return;
    }
    const quiz = await findOwnedQuiz(params.quizId, getAuthUser(request).id);
    if (!quiz) {
      sendNotFound(response, 'Quiz');
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('questions')
      .insert({ ...input, quiz_id: quiz.id, source: 'manual', approved: true })
      .select('*')
      .single();
    throwIfSupabaseError(error);
    response.status(201).json(data);
  }),
);

quizzesRouter.post(
  '/:quizId/questions/import',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(quizIdParamsSchema, request.params, response);
    const body = params ? parseOrReject(csvImportBodySchema, request.body, response) : null;
    if (!params || !body) {
      return;
    }
    const quiz = await findOwnedQuiz(params.quizId, getAuthUser(request).id);
    if (!quiz) {
      sendNotFound(response, 'Quiz');
      return;
    }

    const { questions, rowErrors } = parseQuestionsCsv(body.csv);
    if (rowErrors.length > 0) {
      response.status(400).json({ error: 'CSV has invalid rows, nothing was imported', rowErrors });
      return;
    }

    const { error } = await supabaseAdmin.from('questions').insert(
      questions.map((question) => ({
        ...question,
        quiz_id: quiz.id,
        source: 'manual',
        approved: true,
      })),
    );
    throwIfSupabaseError(error);
    response.status(201).json({ imported: questions.length });
  }),
);

quizzesRouter.post(
  '/:quizId/questions/approve',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(quizIdParamsSchema, request.params, response);
    const body = params ? parseOrReject(approveQuestionsBodySchema, request.body, response) : null;
    if (!params || !body) {
      return;
    }
    const quiz = await findOwnedQuiz(params.quizId, getAuthUser(request).id);
    if (!quiz) {
      sendNotFound(response, 'Quiz');
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('questions')
      .update({ approved: true })
      .eq('quiz_id', quiz.id)
      .in('id', body.questionIds)
      .select('id');
    throwIfSupabaseError(error);
    response.json({ approved: (data ?? []).length });
  }),
);
