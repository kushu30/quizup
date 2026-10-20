import {
  historyRowFromSession,
  myResultFromSession,
  quizActivityFromSessions,
  type QuizSessionHistoryRow,
} from '@quizup/shared';
import { Router } from 'express';
import { z } from 'zod';
import { createRequireAuth, getAuthUser, requireRole, type AccessTokenVerifier } from '../auth.js';
import type { LiveEngine } from '../live/engine.js';
import { asyncRoute, parseOrReject } from '../http.js';

const quizIdParamsSchema = z.object({ quizId: z.string().uuid() });

function newestFirst(first: QuizSessionHistoryRow, second: QuizSessionHistoryRow): number {
  const firstTime = first.startedAt ? Date.parse(first.startedAt) : Number.POSITIVE_INFINITY;
  const secondTime = second.startedAt ? Date.parse(second.startedAt) : Number.POSITIVE_INFINITY;
  return secondTime - firstTime;
}

export function createHistoryRouter(dependencies: {
  engine: LiveEngine;
  verifier: AccessTokenVerifier;
}) {
  const { engine, verifier } = dependencies;
  const repository = engine.repository;
  const router = Router();
  const requireAuth = createRequireAuth(verifier);

  router.get(
    '/quizzes/:quizId/sessions',
    requireAuth,
    requireRole('host', 'admin'),
    asyncRoute(async (request, response) => {
      const params = parseOrReject(quizIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      const quiz = await repository.findOwnedQuiz(params.quizId, getAuthUser(request).id);
      if (!quiz) {
        response.status(404).json({ error: 'quiz_not_found' });
        return;
      }
      const sessions = await repository.listQuizSessions(params.quizId);
      const ratings = await repository.listFeedbackRatings(
        sessions.map((entry) => entry.session.id),
      );
      const rows = sessions.map((entry) =>
        historyRowFromSession({
          session: entry.session,
          participantCount: entry.participantCount,
          summary: entry.summary,
          ratings: ratings
            .filter((rating) => rating.sessionId === entry.session.id)
            .map((rating) => rating.rating),
        }),
      );
      response.json(rows.sort(newestFirst));
    }),
  );

  router.get(
    '/me/quiz-activity',
    requireAuth,
    requireRole('host', 'admin'),
    asyncRoute(async (request, response) => {
      const sessions = await repository.listSessionsForHost(getAuthUser(request).id);
      response.json(quizActivityFromSessions(sessions));
    }),
  );

  router.get(
    '/me/results',
    requireAuth,
    asyncRoute(async (request, response) => {
      const participations = await repository.listParticipationsForUser(getAuthUser(request).id);
      const rows = participations
        .map((entry) => myResultFromSession(entry))
        .sort(
          (first, second) =>
            (second.endedAt ? Date.parse(second.endedAt) : Number.POSITIVE_INFINITY) -
            (first.endedAt ? Date.parse(first.endedAt) : Number.POSITIVE_INFINITY),
        );
      response.json(rows);
    }),
  );

  return router;
}
