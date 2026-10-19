export interface RateLimiter {
  allow: () => boolean;
}

export function createRateLimiter(options: {
  maxEvents: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  let windowStartMs = now();
  let eventsInWindow = 0;

  return {
    allow() {
      const currentMs = now();
      if (currentMs - windowStartMs >= options.windowMs) {
        windowStartMs = currentMs;
        eventsInWindow = 0;
      }
      if (eventsInWindow >= options.maxEvents) {
        return false;
      }
      eventsInWindow += 1;
      return true;
    },
  };
}
