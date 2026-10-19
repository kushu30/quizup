import { sessionCreateSchema, sessionIdParamsSchema } from '@quizup/shared';
import { Router } from 'express';
import { createRequireAuth, getAuthUser, requireRole, type AccessTokenVerifier } from '../auth.js';
import { asyncRoute, parseOrReject } from '../http.js';
import type { LiveEngine } from '../live/engine.js';

export function createSessionsRouter(dependencies: {
  engine: LiveEngine;
  verifier: AccessTokenVerifier;
}): Router {
  const { engine, verifier } = dependencies;
  const router = Router();

  router.use(createRequireAuth(verifier), requireRole('host', 'admin'));

  router.post(
    '/',
    asyncRoute(async (request, response) => {
      const input = parseOrReject(sessionCreateSchema, request.body, response);
      if (!input) {
        return;
      }
      const summary = await engine.createSession({
        quizId: input.quizId,
        hostId: getAuthUser(request).id,
        questionDurationMs: input.questionDurationSeconds * 1000,
      });
      response.status(201).json(summary);
    }),
  );

  router.get(
    '/:sessionId',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      response.json(await engine.getSummary(params.sessionId, getAuthUser(request).id));
    }),
  );

  router.post(
    '/:sessionId/start',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      response.json(await engine.startSession(params.sessionId, getAuthUser(request).id));
    }),
  );

  router.post(
    '/:sessionId/next',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      response.json(await engine.nextQuestion(params.sessionId, getAuthUser(request).id));
    }),
  );

  router.post(
    '/:sessionId/end',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      response.json(await engine.endSession(params.sessionId, getAuthUser(request).id));
    }),
  );

  return router;
}
