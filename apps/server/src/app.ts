import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { serverEnv } from './env.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: serverEnv.CORS_ORIGINS }));
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  return app;
}
