import { exportQuerySchema, sessionCreateSchema, sessionIdParamsSchema } from '@quizup/shared';
import type { Response } from 'express';
import { Router } from 'express';
import { createRequireAuth, getAuthUser, requireRole, type AccessTokenVerifier } from '../auth.js';
import type { AnalyticsAccess, AnalyticsService } from '../analytics/analyticsService.js';
import type { ExamService } from '../exam/examService.js';
import { asyncRoute, parseOrReject, sendNotFound } from '../http.js';
import type { LiveEngine } from '../live/engine.js';
import { getSessionFeedback } from '../feedback/feedback.js';

export function createSessionsRouter(dependencies: {
  engine: LiveEngine;
  verifier: AccessTokenVerifier;
  analytics: AnalyticsService;
  exam: ExamService;
}): Router {
  const { engine, verifier, analytics, exam } = dependencies;
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

  function sendDenied(
    response: Response,
    access: Exclude<AnalyticsAccess<unknown>, { kind: 'ok' }>,
  ) {
    if (access.kind === 'forbidden') {
      response.status(403).json({ error: 'Forbidden' });
      return;
    }
    sendNotFound(response, 'Session');
  }

  router.get(
    '/:sessionId/summary',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      const access = await analytics.getSummary(params.sessionId, getAuthUser(request));
      if (access.kind !== 'ok') {
        sendDenied(response, access);
        return;
      }
      response.json(access.value);
    }),
  );

  router.get(
    '/:sessionId/feedback',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      const feedback = await getSessionFeedback(engine, params.sessionId, getAuthUser(request));
      if (!feedback) {
        response.status(404).json({ error: 'session_not_found' });
        return;
      }
      response.json(feedback);
    }),
  );

  router.get(
    '/:sessionId/export.csv',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      const query = params ? parseOrReject(exportQuerySchema, request.query, response) : null;
      if (!params || !query) {
        return;
      }
      const user = getAuthUser(request);
      const access =
        query.type === 'participants'
          ? await analytics.getParticipantsCsv(params.sessionId, user)
          : await analytics.getResponsesCsv(params.sessionId, user);
      if (access.kind !== 'ok') {
        sendDenied(response, access);
        return;
      }
      response
        .set('Content-Type', 'text/csv; charset=utf-8')
        .set(
          'Content-Disposition',
          `attachment; filename="quizup-${params.sessionId.slice(0, 8)}-${query.type}.csv"`,
        )
        .set('Cache-Control', 'no-store')
        .send(access.value);
    }),
  );

  router.post(
    '/:sessionId/release-results',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      const released = await exam.releaseResults(params.sessionId, getAuthUser(request).id);
      response.json(released);
    }),
  );

  router.get(
    '/:sessionId/proctor',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      const access = await exam.getProctorTimeline(params.sessionId, getAuthUser(request));
      if (access.kind !== 'ok') {
        sendDenied(response, access);
        return;
      }
      response.json(access.value);
    }),
  );

  return router;
}
