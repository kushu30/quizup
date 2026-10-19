import { describe, expect, it } from 'vitest';
import { createHostGenerationLimiter } from './hostGenerationLimiter.js';

describe('createHostGenerationLimiter', () => {
  function acquireAndRelease(
    limiter: ReturnType<typeof createHostGenerationLimiter>,
    host: string,
  ) {
    const result = limiter.tryAcquire(host);
    if (result.ok) {
      result.release();
    }
    return result;
  }

  it('allows 10 requests an hour and rejects the 11th with a retry time', () => {
    let currentMs = 0;
    const limiter = createHostGenerationLimiter({ now: () => currentMs });

    for (let request = 0; request < 10; request += 1) {
      currentMs = request * 1000;
      expect(acquireAndRelease(limiter, 'host-a').ok).toBe(true);
    }
    currentMs = 10_000;
    const eleventh = acquireAndRelease(limiter, 'host-a');
    expect(eleventh).toMatchObject({ ok: false, reason: 'rate_limited' });
    if (!eleventh.ok) {
      expect(eleventh.retryAfterSeconds).toBe(3590);
    }
  });

  it('tracks each host independently', () => {
    const limiter = createHostGenerationLimiter({ maxPerWindow: 1, now: () => 0 });
    expect(acquireAndRelease(limiter, 'host-a').ok).toBe(true);
    expect(acquireAndRelease(limiter, 'host-a').ok).toBe(false);
    expect(acquireAndRelease(limiter, 'host-b').ok).toBe(true);
  });

  it('frees capacity when the window expires', () => {
    let currentMs = 0;
    const limiter = createHostGenerationLimiter({
      maxPerWindow: 2,
      windowMs: 1000,
      now: () => currentMs,
    });
    expect(acquireAndRelease(limiter, 'host-a').ok).toBe(true);
    expect(acquireAndRelease(limiter, 'host-a').ok).toBe(true);
    expect(acquireAndRelease(limiter, 'host-a').ok).toBe(false);

    currentMs = 1000;
    expect(acquireAndRelease(limiter, 'host-a').ok).toBe(true);
  });

  it('allows one request in flight at a time per host', () => {
    const limiter = createHostGenerationLimiter({ now: () => 0 });
    const first = limiter.tryAcquire('host-a');
    expect(first.ok).toBe(true);
    expect(limiter.tryAcquire('host-a')).toMatchObject({ ok: false, reason: 'in_flight' });
    expect(limiter.tryAcquire('host-b').ok).toBe(true);

    if (first.ok) {
      first.release();
    }
    expect(limiter.tryAcquire('host-a').ok).toBe(true);
  });
});
