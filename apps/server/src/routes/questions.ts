import {
  questionBankQuerySchema,
  questionIdParamsSchema,
  questionMoveSchema,
  questionSchema,
  questionUpdateSchema,
  topicsQuerySchema,
} from '@quizup/shared';
import { Router } from 'express';
import { getAuthUser, requireAuth, requireRole } from '../auth.js';
import { asyncRoute, parseOrReject, sendNotFound, throwIfSupabaseError } from '../http.js';
import { findOwnedQuestion, listOwnedQuizIds } from '../ownership.js';
import { serverEnv } from '../env.js';
import { isOwnQuestionImageUrl } from '../questionImageUrl.js';
import { moveQuestionsToModule, supabaseModuleRepository } from '../questionModules.js';
import { supabaseAdmin } from '../supabaseAdmin.js';

export const questionsRouter = Router();

questionsRouter.use(requireAuth, requireRole('host', 'admin'));

function toSafeSearchTerm(raw: string): string {
  return raw.replace(/[%_\\,()*"]/g, ' ').trim();
}

questionsRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    const query = parseOrReject(questionBankQuerySchema, request.query, response);
    if (!query) {
      return;
    }
    const quizIds = await listOwnedQuizIds(getAuthUser(request).id, query.quizId);
    if (quizIds.length === 0) {
      response.json([]);
      return;
    }

    let listing = supabaseAdmin.from('questions').select('*').in('quiz_id', quizIds);
    if (query.topic) {
      listing = listing.eq('topic', query.topic);
    }
    if (query.difficulty) {
      listing = listing.eq('difficulty', query.difficulty);
    }
    if (query.approval) {
      listing = listing.eq('approved', query.approval === 'approved');
    }
    const searchTerm = query.search ? toSafeSearchTerm(query.search) : '';
    if (searchTerm) {
      listing = listing.or(`stem.ilike.%${searchTerm}%,topic.ilike.%${searchTerm}%`);
    }

    const ordered = query.quizId
      ? listing.order('position', { ascending: true }).order('id', { ascending: true })
      : listing.order('topic', { ascending: true }).order('stem', { ascending: true });
    const { data, error } = await ordered.limit(query.limit);
    throwIfSupabaseError(error);
    response.json((data ?? []).map((row) => questionSchema.parse(row)));
  }),
);

questionsRouter.get(
  '/topics',
  asyncRoute(async (request, response) => {
    const query = parseOrReject(topicsQuerySchema, request.query, response);
    if (!query) {
      return;
    }
    const quizIds = await listOwnedQuizIds(getAuthUser(request).id, query.quizId);
    if (quizIds.length === 0) {
      response.json([]);
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('questions')
      .select('topic')
      .in('quiz_id', quizIds);
    throwIfSupabaseError(error);
    const topics = new Set((data ?? []).map((row: { topic: string }) => row.topic));
    response.json([...topics].sort((first, second) => first.localeCompare(second)));
  }),
);

questionsRouter.post(
  '/move',
  asyncRoute(async (request, response) => {
    const body = parseOrReject(questionMoveSchema, request.body, response);
    if (!body) {
      return;
    }
    const moved = await moveQuestionsToModule(
      supabaseModuleRepository,
      getAuthUser(request).id,
      body.questionIds,
      body.topic,
    );
    response.json({ moved });
  }),
);

questionsRouter.patch(
  '/:questionId',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(questionIdParamsSchema, request.params, response);
    const changes = params ? parseOrReject(questionUpdateSchema, request.body, response) : null;
    if (!params || !changes) {
      return;
    }
    if (changes.image_url && !isOwnQuestionImageUrl(changes.image_url, serverEnv.SUPABASE_URL)) {
      response.status(400).json({ error: 'The image must be uploaded through QuizUp' });
      return;
    }
    const question = await findOwnedQuestion(params.questionId, getAuthUser(request).id);
    if (!question) {
      sendNotFound(response, 'Question');
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('questions')
      .update(changes)
      .eq('id', question.id)
      .select('*')
      .single();
    throwIfSupabaseError(error);
    response.json(questionSchema.parse(data));
  }),
);

questionsRouter.delete(
  '/:questionId',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(questionIdParamsSchema, request.params, response);
    if (!params) {
      return;
    }
    const question = await findOwnedQuestion(params.questionId, getAuthUser(request).id);
    if (!question) {
      sendNotFound(response, 'Question');
      return;
    }
    const { error } = await supabaseAdmin.from('questions').delete().eq('id', question.id);
    throwIfSupabaseError(error);
    response.status(204).end();
  }),
);

function createApprovalHandler(approved: boolean) {
  return asyncRoute(async (request, response) => {
    const params = parseOrReject(questionIdParamsSchema, request.params, response);
    if (!params) {
      return;
    }
    const question = await findOwnedQuestion(params.questionId, getAuthUser(request).id);
    if (!question) {
      sendNotFound(response, 'Question');
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('questions')
      .update({ approved })
      .eq('id', question.id)
      .select('*')
      .single();
    throwIfSupabaseError(error);
    response.json(questionSchema.parse(data));
  });
}

questionsRouter.post('/:questionId/approve', createApprovalHandler(true));
questionsRouter.post('/:questionId/unapprove', createApprovalHandler(false));
