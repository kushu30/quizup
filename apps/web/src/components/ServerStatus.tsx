import { timePongPayloadSchema } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { webEnv } from '../lib/env';
import { createQuizSocket } from '../lib/socket';
import { Badge } from './ui';

type HealthState =
  { kind: 'checking' } | { kind: 'ok'; serverTime: string } | { kind: 'down'; reason: string };

type SocketState =
  | { kind: 'checking' }
  | { kind: 'ok'; roundTripMs: number; clockOffsetMs: number }
  | { kind: 'down'; reason: string };

const SOCKET_TIMEOUT_MS = 5000;

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

  const healthLabel =
    health.kind === 'checking'
      ? 'Checking...'
      : health.kind === 'ok'
        ? 'Server OK'
        : `Server down (${health.reason})`;
  const socketLabel =
    socketState.kind === 'checking'
      ? 'Checking...'
      : socketState.kind === 'ok'
        ? `${socketState.roundTripMs} ms (clock offset ${socketState.clockOffsetMs} ms)`
        : `Socket down (${socketState.reason})`;
  const toneFor = (kind: 'checking' | 'ok' | 'down') =>
    kind === 'checking' ? 'neutral' : kind === 'ok' ? 'success' : 'danger';

  return (
    <section aria-label="System status" className="border-t border-rule pt-6">
      <h2 className="text-sm font-semibold text-muted">System status</h2>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-start">
          <dt className="text-muted">Server health</dt>
          <dd>
            <Badge tone={toneFor(health.kind)}>{healthLabel}</Badge>
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-start">
          <dt className="text-muted">Socket round trip</dt>
          <dd>
            <Badge tone={toneFor(socketState.kind)}>{socketLabel}</Badge>
          </dd>
        </div>
      </dl>
    </section>
  );
}
