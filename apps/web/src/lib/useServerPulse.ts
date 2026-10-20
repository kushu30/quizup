import { useEffect, useState } from 'react';
import { webEnv } from './env';

export interface ServerPulse {
  state: 'checking' | 'online' | 'offline';
  latencyMs: number | null;
}

const REFRESH_MS = 30_000;

export function useServerPulse(): ServerPulse {
  const [pulse, setPulse] = useState<ServerPulse>({ state: 'checking', latencyMs: null });

  useEffect(() => {
    let controller = new AbortController();

    async function check() {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      const startedAt = performance.now();
      try {
        const response = await fetch(`${webEnv.VITE_SERVER_URL}/health`, { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as { status?: string };
        if (body.status !== 'ok') {
          throw new Error('Unexpected health payload');
        }
        setPulse({ state: 'online', latencyMs: Math.round(performance.now() - startedAt) });
      } catch {
        if (!signal.aborted) {
          setPulse({ state: 'offline', latencyMs: null });
        }
      }
    }

    void check();
    const timer = setInterval(() => void check(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  return pulse;
}
