import {
  questionBankQuerySchema,
  questionIdParamsSchema,
  questionSchema,
  questionUpdateSchema,
  topicsQuerySchema,
} from '@quizup/shared';
import { Router } from 'express';
import { getAuthUser, requireAuth, requireRole } from '../auth.js';
import { asyncRoute, parseOrReject, sendNotFound, throwIfSupabaseError } from '../http.js';
import { findOwnedQuestion, listOwnedQuizIds } from '../ownership.js';
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
    const searchTerm = query.search ? toSafeSearchTerm(query.search) : '';
    if (searchTerm) {
      listing = listing.or(`stem.ilike.%${searchTerm}%,topic.ilike.%${searchTerm}%`);
    }

    const { data, error } = await listing
      .order('topic', { ascending: true })
      .order('stem', { ascending: true })
      .limit(query.limit);
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

questionsRouter.patch(
  '/:questionId',
  asyncRoute(async (request, response) => {
    const params = parseOrReject(questionIdParamsSchema, request.params, response);
    const changes = params ? parseOrReject(questionUpdateSchema, request.body, response) : null;
    if (!params || !changes) {
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
