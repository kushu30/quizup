import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimiter.js';

describe('createRateLimiter', () => {
  it('blocks events over the limit and recovers after the window', () => {
    let currentMs = 0;
    const limiter = createRateLimiter({ maxEvents: 2, windowMs: 1000, now: () => currentMs });

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);

    currentMs = 1000;
    expect(limiter.allow()).toBe(true);
  });
});
