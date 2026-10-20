import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { AnalyticsService } from './analytics/analyticsService.js';
import { requireAuth, type AccessTokenVerifier } from './auth.js';
import { serverEnv } from './env.js';
import { errorHandler } from './http.js';
import type { ExamService } from './exam/examService.js';
import type { LiveEngine } from './live/engine.js';
import {
  supabaseGenerationRepository,
  type GenerationRepository,
} from './llm/generationRepository.js';
import {
  createHostGenerationLimiter,
  type HostGenerationLimiter,
} from './llm/hostGenerationLimiter.js';
import type { LlmProvider } from './llm/provider.js';
import { createGenerationRouter } from './routes/generation.js';
import { questionsRouter } from './routes/questions.js';
import { quizzesRouter } from './routes/quizzes.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createHistoryRouter } from './history/historyRouter.js';
import { createJoinInfoRouter } from './joinInfo/joinInfoRouter.js';
import { createMailer, type Mailer } from './mail/mailer.js';
import {
  createAdminRouter,
  supabaseHostAllowlist,
  type HostAllowlistLookup,
} from './routes/admin.js';

export interface AppDependencies {
  engine: LiveEngine;
  exam: ExamService;
  verifier: AccessTokenVerifier;
  llmProvider?: LlmProvider | null;
  generationLimiter?: HostGenerationLimiter;
  generationRepository?: GenerationRepository;
  mailer?: Mailer;
  appUrl?: string;
  hostAllowlist?: HostAllowlistLookup;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const mailer = dependencies.mailer ?? createMailer(serverEnv);
  const appUrl = dependencies.appUrl ?? serverEnv.APP_URL ?? serverEnv.CORS_ORIGINS[0] ?? '';

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: serverEnv.CORS_ORIGINS }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get('/me', requireAuth, (request, response) => {
    response.json(request.authUser);
  });

  app.use(
    '/quizzes',
    createGenerationRouter({
      verifier: dependencies.verifier,
      provider: dependencies.llmProvider ?? null,
      limiter: dependencies.generationLimiter ?? createHostGenerationLimiter(),
      repository: dependencies.generationRepository ?? supabaseGenerationRepository,
    }),
  );
  app.use(createJoinInfoRouter({ engine: dependencies.engine }));
  app.use(createHistoryRouter({ engine: dependencies.engine, verifier: dependencies.verifier }));
  app.use('/quizzes', quizzesRouter);
  app.use('/questions', questionsRouter);
  app.use(
    '/admin',
    createAdminRouter({
      verifier: dependencies.verifier,
      mailer,
      appUrl,
      allowlist: dependencies.hostAllowlist ?? supabaseHostAllowlist,
    }),
  );
  app.use(
    '/sessions',
    createSessionsRouter({
      engine: dependencies.engine,
      verifier: dependencies.verifier,
      analytics: new AnalyticsService(dependencies.engine),
      exam: dependencies.exam,
      mailer,
      appUrl,
    }),
  );
  app.use(errorHandler);

  return app;
}
