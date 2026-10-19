import { timePongPayloadSchema } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { webEnv } from '../lib/env';
import { createQuizSocket } from '../lib/socket';

type HealthState =
  { kind: 'checking' } | { kind: 'ok'; serverTime: string } | { kind: 'down'; reason: string };

type SocketState =
  | { kind: 'checking' }
  | { kind: 'ok'; roundTripMs: number; clockOffsetMs: number }
  | { kind: 'down'; reason: string };

const SOCKET_TIMEOUT_MS = 5000;

function Badge({ ok, pending, label }: { ok: boolean; pending: boolean; label: string }) {
  const color = pending
    ? 'bg-slate-100 text-slate-600'
    : ok
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-red-100 text-red-800';
  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${color}`}>{label}</span>;
}

export function ServerStatus() {
  const [health, setHealth] = useState<HealthState>({ kind: 'checking' });
  const [socketState, setSocketState] = useState<SocketState>({ kind: 'checking' });

  useEffect(() => {
    const abortController = new AbortController();

    fetch(`${webEnv.VITE_SERVER_URL}/health`, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as { status?: string; time?: string };
        if (body.status !== 'ok') {
          throw new Error('Unexpected health payload');
        }
        setHealth({ kind: 'ok', serverTime: body.time ?? '' });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        setHealth({ kind: 'down', reason: error instanceof Error ? error.message : 'Unknown' });
      });

    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const socket = createQuizSocket();
    const timeoutId = setTimeout(() => {
      setSocketState({ kind: 'down', reason: 'Timed out' });
    }, SOCKET_TIMEOUT_MS);

    socket.on('connect', () => {
      socket.emit('time:ping', { clientSentMs: Date.now() }, () => undefined);
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeoutId);
      setSocketState({ kind: 'down', reason: error.message });
    });

    socket.on('time:pong', (payload) => {
      const parsed = timePongPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      clearTimeout(timeoutId);
      const receivedMs = Date.now();
      const roundTripMs = receivedMs - parsed.data.clientSentMs;
      const clockOffsetMs = parsed.data.serverNowMs - (parsed.data.clientSentMs + roundTripMs / 2);
      setSocketState({ kind: 'ok', roundTripMs, clockOffsetMs: Math.round(clockOffsetMs) });
    });

    return () => {
      clearTimeout(timeoutId);
      socket.disconnect();
    };
  }, []);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">Server health</span>
        <Badge
          pending={health.kind === 'checking'}
          ok={health.kind === 'ok'}
          label={
            health.kind === 'checking'
              ? 'Checking...'
              : health.kind === 'ok'
                ? 'Server OK'
                : `Server down (${health.reason})`
          }
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">Socket round trip</span>
        <Badge
          pending={socketState.kind === 'checking'}
          ok={socketState.kind === 'ok'}
          label={
            socketState.kind === 'checking'
              ? 'Checking...'
              : socketState.kind === 'ok'
                ? `${socketState.roundTripMs} ms (clock offset ${socketState.clockOffsetMs} ms)`
                : `Socket down (${socketState.reason})`
          }
        />
      </div>
    </div>
  );
}
