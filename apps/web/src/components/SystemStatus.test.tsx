import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuizSocket } from '../lib/socket';
import { SystemStatus } from './SystemStatus';

vi.mock('../lib/env', () => ({ webEnv: { VITE_SERVER_URL: 'http://server.test' } }));
vi.mock('../lib/socket', () => ({ createQuizSocket: vi.fn() }));

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  private readonly handlers = new Map<string, Handler>();
  readonly emitted: { event: string; payload: { clientSentMs: number } }[] = [];
  readonly disconnect = vi.fn();

  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
    return this;
  }

  emit(event: string, payload: { clientSentMs: number }) {
    this.emitted.push({ event, payload });
    return this;
  }

  fire(event: string, ...args: unknown[]) {
    act(() => this.handlers.get(event)?.(...args));
  }
}

let sockets: FakeSocket[];

function healthy(ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      ok
        ? { ok: true, json: async () => ({ status: 'ok', time: '2026-10-20T10:00:00Z' }) }
        : { ok: false, status: 503, json: async () => ({}) },
    ),
  );
}

function answerPing(socket: FakeSocket, roundTripMs: number, offsetMs: number) {
  socket.fire('connect');
  const sent = socket.emitted[0]?.payload.clientSentMs ?? 0;
  vi.setSystemTime(sent + roundTripMs);
  socket.fire('time:pong', {
    clientSentMs: sent,
    serverNowMs: sent + roundTripMs / 2 + offsetMs,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_800_000_000_000);
  sockets = [];
  vi.mocked(createQuizSocket).mockImplementation(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket as never;
  });
  healthy();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SystemStatus', () => {
  it('stays quiet until someone opens it: no request, no socket', () => {
    render(<SystemStatus />);
    const pill = screen.getByRole('button', { name: /system status/i });
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    expect(fetch).not.toHaveBeenCalled();
    expect(createQuizSocket).not.toHaveBeenCalled();
    expect(screen.queryByText('Server health')).toBeNull();
  });

  it('checks the server and the socket when opened and shows both results', async () => {
    render(<SystemStatus />);
    fireEvent.click(screen.getByRole('button', { name: /system status/i }));
    expect(await screen.findByText('Server OK')).toBeTruthy();
    answerPing(sockets[0]!, 300, -14);
    expect(await screen.findByText('300 ms (clock offset -14 ms)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /all systems normal/i })).toBeTruthy();
  });

  it('says so when the server cannot be reached', async () => {
    healthy(false);
    render(<SystemStatus />);
    fireEvent.click(screen.getByRole('button', { name: /system status/i }));
    expect(await screen.findByText(/Server down \(HTTP 503\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /service issue/i })).toBeTruthy();
  });

  it('closes with Escape and checks again on request', async () => {
    render(<SystemStatus />);
    fireEvent.click(screen.getByRole('button', { name: /system status/i }));
    await screen.findByText('Server OK');
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(sockets).toHaveLength(2);
    expect(sockets[0]?.disconnect).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Server health')).toBeNull();
  });
});
