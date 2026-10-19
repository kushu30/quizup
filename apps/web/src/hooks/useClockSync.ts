import { estimateClockOffsetMs, timePongPayloadSchema, type ClockSample } from '@quizup/shared';
import { useEffect, useState } from 'react';
import type { QuizSocket } from '../lib/socket';

const PINGS_PER_SYNC = 5;
const PING_SPACING_MS = 120;
const RESYNC_INTERVAL_MS = 30_000;
const NOOP_ACK = () => undefined;

export function useClockSync(socket: QuizSocket | null): { offsetMs: number; synced: boolean } {
  const [offsetMs, setOffsetMs] = useState(0);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!socket) {
      return;
    }
    let samples: ClockSample[] = [];
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    function handlePong(payload: unknown) {
      const parsed = timePongPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      samples.push({
        clientSentMs: parsed.data.clientSentMs,
        serverNowMs: parsed.data.serverNowMs,
        clientReceivedMs: Date.now(),
      });
      const estimate = estimateClockOffsetMs(samples);
      if (estimate !== null) {
        setOffsetMs(estimate);
        setSynced(true);
      }
    }

    function runSync() {
      samples = [];
      for (let index = 0; index < PINGS_PER_SYNC; index += 1) {
        const timer = setTimeout(() => {
          pendingTimers.delete(timer);
          socket?.emit('time:ping', { clientSentMs: Date.now() }, NOOP_ACK);
        }, index * PING_SPACING_MS);
        pendingTimers.add(timer);
      }
    }

    socket.on('time:pong', handlePong);
    socket.on('connect', runSync);
    if (socket.connected) {
      runSync();
    }
    const resyncInterval = setInterval(() => {
      if (socket.connected) {
        runSync();
      }
    }, RESYNC_INTERVAL_MS);

    return () => {
      socket.off('time:pong', handlePong);
      socket.off('connect', runSync);
      clearInterval(resyncInterval);
      pendingTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [socket]);

  return { offsetMs, synced };
}
