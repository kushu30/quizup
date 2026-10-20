import {
  exportQuerySchema,
  rosterAddPayloadSchema,
  rosterEmailPayloadSchema,
  rosterEmailPreviewPayloadSchema,
  rosterEntryParamsSchema,
  sessionCreateSchema,
  sessionIdParamsSchema,
  sessionParticipantParamsSchema,
  studentResultParamsSchema,
  sessionStartSchema,
} from '@quizup/shared';
import type { Response } from 'express';
import { Router } from 'express';
import { createRequireAuth, getAuthUser, requireRole, type AccessTokenVerifier } from '../auth.js';
import type { AnalyticsAccess, AnalyticsService } from '../analytics/analyticsService.js';
import type { ExamService } from '../exam/examService.js';
import { asyncRoute, parseOrReject, sendNotFound } from '../http.js';
import type { LiveEngine } from '../live/engine.js';
import { getSessionFeedback } from '../feedback/feedback.js';
import { mailFailureText, type Mailer } from '../mail/mailer.js';
import { knownAccounts, type AccountDirectory } from '../mail/accounts.js';
import {
  SAMPLE_ACCOUNT,
  SAMPLE_STUDENT,
  renderMailFor,
  sendTokenEmails,
} from '../mail/rosterEmail.js';
import { EngineError } from '../live/types.js';
import type { StudentResultService } from '../results/studentResultService.js';

export function createSessionsRouter(dependencies: {
  engine: LiveEngine;
  verifier: AccessTokenVerifier;
  analytics: AnalyticsService;
  exam: ExamService;
  mailer: Mailer;
  appUrl: string;
  accounts: AccountDirectory;
  studentResults: StudentResultService;
}): Router {
  const { engine, verifier, analytics, exam, mailer, appUrl, accounts, studentResults } =
    dependencies;
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
      const body = parseOrReject(sessionStartSchema, request.body ?? {}, response);
      if (!body) {
        return;
      }
      response.json(
        await engine.startSession(params.sessionId, getAuthUser(request).id, {
          proctored: body.proctored,
        }),
      );
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
    '/:sessionId/roster',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      response.set('Cache-Control', 'no-store').json({
        entries: engine.listRoster(params.sessionId, getAuthUser(request).id),
        emailEnabled: mailer.enabled,
      });
    }),
  );

  router.post(
    '/:sessionId/roster',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      const body = params ? parseOrReject(rosterAddPayloadSchema, request.body, response) : null;
      if (!params || !body) {
        return;
      }
      const added = await engine.addRoster(
        params.sessionId,
        getAuthUser(request).id,
        body.students,
      );
      response.status(201).set('Cache-Control', 'no-store').json(added);
    }),
  );

  router.post(
    '/:sessionId/roster/email',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      const body = params
        ? parseOrReject(rosterEmailPayloadSchema, request.body ?? {}, response)
        : null;
      if (!params || !body) {
        return;
      }
      const prepared = engine.prepareTokenEmails(
        params.sessionId,
        getAuthUser(request).id,
        body.rosterIds,
      );
      if (!mailer.enabled) {
        throw new EngineError('mail_not_configured', 'Email is not set up on this server');
      }
      response.set('Cache-Control', 'no-store').json(
        await sendTokenEmails(
          mailer,
          appUrl,
          prepared,
          { subject: body.subject, message: body.message },
          await knownAccounts(
            accounts,
            prepared.items.map((entry) => entry.email),
          ),
        ),
      );
    }),
  );

  router.post(
    '/:sessionId/roster/email/preview',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      const body = params
        ? parseOrReject(rosterEmailPreviewPayloadSchema, request.body ?? {}, response)
        : null;
      if (!params || !body) {
        return;
      }
      const prepared = engine.prepareTokenEmails(
        params.sessionId,
        getAuthUser(request).id,
        body.rosterId ? [body.rosterId] : undefined,
      );
      const item = prepared.items[0];
      const existing = item ? await knownAccounts(accounts, [item.email]) : new Set<string>();
      const mail = renderMailFor(
        prepared,
        item ?? SAMPLE_STUDENT,
        appUrl,
        body,
        item
          ? { email: item.email, hasAccount: existing.has(item.email.toLowerCase()) }
          : SAMPLE_ACCOUNT,
      );
      response.set('Cache-Control', 'no-store').json({
        to: item?.email ?? null,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        sample: !item,
      });
    }),
  );

  router.post(
    '/:sessionId/roster/email/test',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionIdParamsSchema, request.params, response);
      const body = params
        ? parseOrReject(rosterEmailPreviewPayloadSchema, request.body ?? {}, response)
        : null;
      if (!params || !body) {
        return;
      }
      const user = getAuthUser(request);
      const prepared = engine.prepareTokenEmails(params.sessionId, user.id, []);
      if (!mailer.enabled) {
        throw new EngineError('mail_not_configured', 'Email is not set up on this server');
      }
      if (!user.email) {
        response.status(409).json({ error: 'Your account has no email address to send a test to' });
        return;
      }
      const mail = renderMailFor(prepared, SAMPLE_STUDENT, appUrl, body, SAMPLE_ACCOUNT);
      try {
        await mailer.send({ to: user.email, ...mail, subject: `[Test] ${mail.subject}` });
      } catch (error) {
        response.status(502).json({ error: mailFailureText(error) });
        return;
      }
      response.set('Cache-Control', 'no-store').json({ sentTo: user.email });
    }),
  );

  router.post(
    '/:sessionId/roster/:rosterId/reissue',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(rosterEntryParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      const reissued = await engine.reissueRosterToken(
        params.sessionId,
        getAuthUser(request).id,
        params.rosterId,
      );
      response.set('Cache-Control', 'no-store').json(reissued);
    }),
  );

  router.delete(
    '/:sessionId/roster/:rosterId',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(rosterEntryParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      await engine.removeRosterEntry(params.sessionId, getAuthUser(request).id, params.rosterId);
      response.status(204).end();
    }),
  );

  router.post(
    '/:sessionId/participants/:participantId/allow-rejoin',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(sessionParticipantParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      response.json(
        engine.allowRejoin(params.sessionId, getAuthUser(request).id, params.participantId),
      );
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
    '/:sessionId/participants/:participantId/result',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(studentResultParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      const access = await studentResults.forHost(
        params.sessionId,
        params.participantId,
        getAuthUser(request),
      );
      if (access.kind === 'ok') {
        response.json(access.value);
      } else if (access.kind === 'forbidden') {
        response.status(403).json({ error: 'forbidden' });
      } else {
        sendNotFound(response, 'Result');
      }
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
