export const GENERATIONS_PER_WINDOW = 10;
export const GENERATION_WINDOW_MS = 60 * 60 * 1000;
export const IN_FLIGHT_RETRY_AFTER_SECONDS = 10;

export type GenerationLimitReason = 'rate_limited' | 'in_flight';

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: GenerationLimitReason; retryAfterSeconds: number };

export interface HostGenerationLimiter {
  tryAcquire: (hostId: string) => AcquireResult;
}

export function createHostGenerationLimiter(options?: {
  maxPerWindow?: number;
  windowMs?: number;
  now?: () => number;
}): HostGenerationLimiter {
  const maxPerWindow = options?.maxPerWindow ?? GENERATIONS_PER_WINDOW;
  const windowMs = options?.windowMs ?? GENERATION_WINDOW_MS;
  const now = options?.now ?? Date.now;
  const requestTimesByHost = new Map<string, number[]>();
  const hostsInFlight = new Set<string>();

  return {
    tryAcquire(hostId) {
      const currentMs = now();
      const recent = (requestTimesByHost.get(hostId) ?? []).filter(
        (requestedAtMs) => currentMs - requestedAtMs < windowMs,
      );

      const oldest = recent[0];
      if (recent.length >= maxPerWindow && oldest !== undefined) {
        requestTimesByHost.set(hostId, recent);
        return {
          ok: false,
          reason: 'rate_limited',
          retryAfterSeconds: Math.max(Math.ceil((oldest + windowMs - currentMs) / 1000), 1),
        };
      }

      if (hostsInFlight.has(hostId)) {
        requestTimesByHost.set(hostId, recent);
        return {
          ok: false,
          reason: 'in_flight',
          retryAfterSeconds: IN_FLIGHT_RETRY_AFTER_SECONDS,
        };
      }

      recent.push(currentMs);
      requestTimesByHost.set(hostId, recent);
      hostsInFlight.add(hostId);
      return {
        ok: true,
        release: () => {
          hostsInFlight.delete(hostId);
        },
      };
    },
  };
}
