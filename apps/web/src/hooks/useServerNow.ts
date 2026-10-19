import { useEffect, useState } from 'react';

const TICK_MS = 100;

export function useServerNow(offsetMs: number): number {
  const [serverNowMs, setServerNowMs] = useState(() => Date.now() + offsetMs);

  useEffect(() => {
    setServerNowMs(Date.now() + offsetMs);
    const interval = setInterval(() => setServerNowMs(Date.now() + offsetMs), TICK_MS);
    return () => clearInterval(interval);
  }, [offsetMs]);

  return serverNowMs;
}
