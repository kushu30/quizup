import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { requireAuth } from './auth.js';
import { serverEnv } from './env.js';
import { errorHandler } from './http.js';
import { questionsRouter } from './routes/questions.js';
import { quizzesRouter } from './routes/quizzes.js';

export function createApp() {
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
  app.use(errorHandler);

  return app;
}
