import { generateQuestionsRequestSchema, quizIdParamsSchema } from '@quizup/shared';
import { Router } from 'express';
import { createRequireAuth, getAuthUser, requireRole, type AccessTokenVerifier } from '../auth.js';
import { asyncRoute, parseOrReject, sendNotFound } from '../http.js';
import { generateQuestions } from '../llm/generateQuestions.js';
import type { GenerationRepository } from '../llm/generationRepository.js';
import type { HostGenerationLimiter } from '../llm/hostGenerationLimiter.js';
import type { LlmProvider } from '../llm/provider.js';

export interface GenerationRouterDependencies {
  verifier: AccessTokenVerifier;
  provider: LlmProvider | null;
  limiter: HostGenerationLimiter;
  repository: GenerationRepository;
  timeoutMs?: number;
  randomIndex?: (exclusiveMax: number) => number;
}

function formatWait(seconds: number): string {
  return seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
}

export function createGenerationRouter(dependencies: GenerationRouterDependencies): Router {
  const { verifier, provider, limiter, repository } = dependencies;
  const router = Router();
  const requireAuth = createRequireAuth(verifier);
  const requireHost = requireRole('host', 'admin');

  router.post(
    '/:quizId/generate-questions',
    requireAuth,
    requireHost,
    asyncRoute(async (request, response) => {
      const params = parseOrReject(quizIdParamsSchema, request.params, response);
      const input = params
        ? parseOrReject(generateQuestionsRequestSchema, request.body, response)
        : null;
      if (!params || !input) {
        return;
      }

      const hostId = getAuthUser(request).id;
      const quiz = await repository.findOwnedQuiz(params.quizId, hostId);
      if (!quiz) {
        sendNotFound(response, 'Quiz');
        return;
      }

      if (!provider) {
        response.status(503).json({
          error: 'llm_not_configured',
          message: 'AI question generation is not configured on this server.',
        });
        return;
      }

      const permit = limiter.tryAcquire(hostId);
      if (!permit.ok) {
        response.set('Retry-After', String(permit.retryAfterSeconds));
        response.status(429).json({
          error: 'rate_limited',
          message:
            permit.reason === 'in_flight'
              ? 'A generation is already running. Wait for it to finish.'
              : `Generation limit reached. Try again in ${formatWait(permit.retryAfterSeconds)}.`,
          retryAfterSeconds: permit.retryAfterSeconds,
        });
        return;
      }

      try {
        const outcome = await generateQuestions(
          {
            provider,
            timeoutMs: dependencies.timeoutMs,
            randomIndex: dependencies.randomIndex,
          },
          input,
        );

        if (!outcome.ok && outcome.reason === 'provider_unavailable') {
          console.error('LLM provider call failed', {
            provider: provider.name,
            kind: outcome.providerErrorKind,
          });
          response.status(503).json({
            error: 'provider_unavailable',
            message: 'The AI service is unavailable right now. Try again soon.',
          });
          return;
        }
        if (!outcome.ok) {
          console.error('LLM output failed validation twice', { provider: provider.name });
          response.status(502).json({
            error: 'generation_failed',
            message: 'The AI returned questions that failed validation. Nothing was saved.',
            summary: outcome.summary,
          });
          return;
        }

        const inserted = await repository.insertGeneratedQuestions(quiz.id, outcome.questions);
        response.status(201).json(inserted);
      } finally {
        permit.release();
      }
    }),
  );

  return router;
}
