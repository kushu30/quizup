import { timePongPayloadSchema } from '@quizup/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { webEnv } from '../lib/env';
import { createQuizSocket } from '../lib/socket';

type HealthState =
  { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok' } | { kind: 'down'; reason: string };

type SocketState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; roundTripMs: number; clockOffsetMs: number }
  | { kind: 'down'; reason: string };

const SOCKET_TIMEOUT_MS = 5000;

const DOT: Record<'idle' | 'checking' | 'ok' | 'down', string> = {
  idle: 'bg-rule-strong',
  checking: 'bg-marker',
  ok: 'bg-success',
  down: 'bg-alert',
};

function overallKind(health: HealthState, socket: SocketState): keyof typeof DOT {
  if (health.kind === 'down' || socket.kind === 'down') {
    return 'down';
  }
  if (health.kind === 'checking' || socket.kind === 'checking') {
    return 'checking';
  }
  return health.kind === 'ok' && socket.kind === 'ok' ? 'ok' : 'idle';
}

const PILL_TEXT: Record<keyof typeof DOT, string> = {
  idle: 'Status',
  checking: 'Checking',
  ok: 'All systems normal',
  down: 'Service issue',
};

const PILL_NAME: Record<keyof typeof DOT, string> = {
  idle: 'not checked yet',
  checking: 'checking',
  ok: 'all systems normal',
  down: 'service issue',
};

function resultText(kind: 'idle' | 'checking' | 'ok' | 'down', ok: string, down: string): string {
  return kind === 'ok' ? ok : kind === 'down' ? down : 'Checking...';
}

export function SystemStatus() {
  const [open, setOpen] = useState(false);
  const [runId, setRunId] = useState(0);
  const [health, setHealth] = useState<HealthState>({ kind: 'idle' });
  const [socketState, setSocketState] = useState<SocketState>({ kind: 'idle' });
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (runId === 0) {
      return;
    }
    setHealth({ kind: 'checking' });
    setSocketState({ kind: 'checking' });
    const abortController = new AbortController();

    fetch(`${webEnv.VITE_SERVER_URL}/health`, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as { status?: string };
        if (body.status !== 'ok') {
          throw new Error('Unexpected health payload');
        }
        setHealth({ kind: 'ok' });
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setHealth({ kind: 'down', reason: error instanceof Error ? error.message : 'Unknown' });
        }
      });

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
      const roundTripMs = Date.now() - parsed.data.clientSentMs;
      const clockOffsetMs = parsed.data.serverNowMs - (parsed.data.clientSentMs + roundTripMs / 2);
      setSocketState({ kind: 'ok', roundTripMs, clockOffsetMs: Math.round(clockOffsetMs) });
    });

    return () => {
      abortController.abort();
      clearTimeout(timeoutId);
      socket.disconnect();
    };
  }, [runId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const overall = overallKind(health, socketState);

  function toggle() {
    if (!open) {
      setRunId((current) => current + 1);
    }
    setOpen((current) => !current);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`System status: ${PILL_NAME[overall]}`}
        onClick={toggle}
        className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-rule-strong hover:text-ink"
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[overall]}`} />
        {PILL_TEXT[overall]}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute bottom-full right-0 z-20 mb-2 w-72 rounded-lg border border-rule bg-surface p-4 shadow-lg"
        >
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Server health</dt>
              <dd className="font-medium">
                {resultText(
                  health.kind,
                  'Server OK',
                  health.kind === 'down' ? `Server down (${health.reason})` : '',
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Socket round trip</dt>
              <dd className="text-right font-medium">
                {resultText(
                  socketState.kind,
                  socketState.kind === 'ok'
                    ? `${socketState.roundTripMs} ms (clock offset ${socketState.clockOffsetMs} ms)`
                    : '',
                  socketState.kind === 'down' ? `Socket down (${socketState.reason})` : '',
                )}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setRunId((current) => current + 1)}
            className="mt-4 text-sm font-medium text-board underline underline-offset-4"
          >
            Check again
          </button>
        </div>
      )}
    </div>
  );
}
