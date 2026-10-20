import { JOIN_CODE_LENGTH } from '@quizup/shared';
import { Router } from 'express';
import { createRateLimiter, type RateLimiter } from '../rateLimiter.js';
import type { LiveEngine } from '../live/engine.js';

const REQUESTS_PER_MINUTE = 240;
const WINDOW_MS = 60_000;
const MAX_TRACKED_VISITORS = 5000;
const CODE_PATTERN = new RegExp(`^[A-Za-z0-9]{${JOIN_CODE_LENGTH}}$`);

export function createJoinInfoRouter(dependencies: { engine: LiveEngine }) {
  const router = Router();
  const limiters = new Map<string, RateLimiter>();

  function limiterFor(visitor: string): RateLimiter {
    const existing = limiters.get(visitor);
    if (existing) {
      return existing;
    }
    if (limiters.size >= MAX_TRACKED_VISITORS) {
      limiters.clear();
    }
    const created = createRateLimiter({ maxEvents: REQUESTS_PER_MINUTE, windowMs: WINDOW_MS });
    limiters.set(visitor, created);
    return created;
  }

  router.get('/join-info/:code', (request, response) => {
    if (!limiterFor(request.ip ?? 'unknown').allow()) {
      response.status(429).json({ error: 'rate_limited' });
      return;
    }
    const code = request.params.code ?? '';
    const info = CODE_PATTERN.test(code) ? dependencies.engine.getJoinInfo(code) : null;
    if (!info) {
      response.status(404).json({ error: 'session_not_found' });
      return;
    }
    response.json(info);
  });

  return router;
}
