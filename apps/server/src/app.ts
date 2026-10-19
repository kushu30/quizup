import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { requireAuth, type AccessTokenVerifier } from './auth.js';
import { serverEnv } from './env.js';
import { errorHandler } from './http.js';
import type { LiveEngine } from './live/engine.js';
import { questionsRouter } from './routes/questions.js';
import { quizzesRouter } from './routes/quizzes.js';
import { createSessionsRouter } from './routes/sessions.js';

export interface AppDependencies {
  engine: LiveEngine;
  verifier: AccessTokenVerifier;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();

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

  app.use('/quizzes', quizzesRouter);
  app.use('/questions', questionsRouter);
  app.use('/sessions', createSessionsRouter(dependencies));
  app.use(errorHandler);

  return app;
}
