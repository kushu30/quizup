import type { RoomJoinAck, RoomStatePayload } from '@quizup/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markIntroDone } from '../lib/introGate';
import { createQuizSocket } from '../lib/socket';
import { Play } from './Play';

vi.mock('../lib/socket', () => ({ createQuizSocket: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
vi.mock('../hooks/useClockSync', () => ({ useClockSync: () => ({ offsetMs: 0, synced: true }) }));

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  private readonly handlers = new Map<string, Handler[]>();
  readonly emitted: { event: string; payload: unknown; ack?: (response: unknown) => void }[] = [];
  readonly disconnect = vi.fn();
  readonly connect = vi.fn();

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  off() {
    return this;
  }

  emit(event: string, payload: unknown, ack?: (response: unknown) => void) {
    this.emitted.push({ event, payload, ack });
    return this;
  }

  fire(event: string, ...args: unknown[]) {
    act(() => {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    });
  }

  joins() {
    return this.emitted.filter((entry) => entry.event === 'room:join');
  }
}

const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const PARTICIPANT_ID = '55555555-5555-4555-8555-555555555555';

const ROOM: RoomStatePayload = {
  sessionId: SESSION_ID,
  joinCode: 'ABC234',
  quizTitle: 'Fractions review',
  branding: null,
  accessMode: 'open',
  proctored: false,
  startedAtServerMs: null,
  status: 'lobby',
  role: 'student',
  serverNowMs: 0,
  participants: [],
  currentQuestion: null,
  questionClosed: false,
  mode: 'live',
  exam: null,
  examProgress: null,
  adaptive: false,
  round: null,
  adaptiveTable: null,
  youAnswered: false,
  answeredCount: null,
  lastResult: null,
  leaderboard: [],
  you: null,
};

const OK: RoomJoinAck = {
  ok: true,
  role: 'student',
  sessionId: SESSION_ID,
  participantId: PARTICIPANT_ID,
  displayName: 'Ada',
  rejoinToken: 'rejoin-1',
};

let fake: FakeSocket;

async function renderPlay(state: object = { displayName: 'Ada' }) {
  fake = new FakeSocket();
  vi.mocked(createQuizSocket).mockReturnValue(fake as never);
  render(
    <MemoryRouter initialEntries={[{ pathname: '/play/ABC234', state }]}>
      <Routes>
        <Route path="/play/:code" element={<Play />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(vi.mocked(createQuizSocket)).toHaveBeenCalled());
}

function connectAndJoin(ack: unknown = OK) {
  fake.fire('connect');
  const join = fake.joins().at(-1);
  act(() => join?.ack?.(ack));
  fake.fire('room:state', ROOM);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  markIntroDone('ABC234');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Play connection', () => {
  it('keeps the screen and says it is reconnecting when the connection drops', async () => {
    await renderPlay();
    connectAndJoin();
    expect(screen.getByRole('heading', { name: 'You are in' })).toBeTruthy();

    fake.fire('disconnect', 'transport close');
    expect(screen.getByRole('heading', { name: 'You are in' })).toBeTruthy();
    expect(screen.getByRole('status', { name: /reconnecting/i })).toBeTruthy();

    fake.fire('connect');
    expect(fake.joins().at(-1)?.payload).toMatchObject({
      joinCode: 'ABC234',
      displayName: 'Ada',
      rejoinToken: 'rejoin-1',
    });
    act(() => fake.joins().at(-1)?.ack?.(OK));
    expect(screen.queryByRole('status', { name: /reconnecting/i })).toBeNull();
  });

  it('keeps trying instead of showing an error when a reconnect is turned away for a moment', async () => {
    await renderPlay();
    connectAndJoin();
    fake.fire('disconnect', 'transport close');
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    fake.fire('connect');
    act(() => fake.joins().at(-1)?.ack?.({ ok: false, error: 'rate_limited' }));
    expect(screen.getByRole('heading', { name: 'You are in' })).toBeTruthy();
    const before = fake.joins().length;
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fake.joins().length).toBe(before + 1);
  });

  it('says so when the seat was opened on another device, and takes it back on request', async () => {
    await renderPlay();
    connectAndJoin();
    fake.fire('disconnect', 'io server disconnect');
    expect(screen.getByText(/open on another device/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use this device' }));
    expect(fake.connect).toHaveBeenCalled();
  });

  it('tells a student who lost their seat to ask the host to let them back in', async () => {
    window.localStorage.setItem(
      'quizup:join:ABC234',
      JSON.stringify({ participantId: PARTICIPANT_ID, rejoinToken: 'old', displayName: 'Ada' }),
    );
    await renderPlay({});
    fake.fire('connect');
    act(() => fake.joins().at(-1)?.ack?.({ ok: false, error: 'invalid_rejoin_token' }));
    expect(screen.getByText(/ask your host to let you back in/i)).toBeTruthy();
    expect(window.localStorage.getItem('quizup:join:ABC234')).toBeNull();
  });

  it('joins an access-token quiz with the token and keeps it for later reconnects', async () => {
    await renderPlay({ accessToken: 'ABCDE23456' });
    fake.fire('connect');
    expect(fake.joins().at(-1)?.payload).toEqual({ joinCode: 'ABC234', accessToken: 'ABCDE23456' });
    act(() => fake.joins().at(-1)?.ack?.(OK));
    fake.fire('room:state', ROOM);
    expect(screen.getByText('Ada')).toBeTruthy();

    fake.fire('disconnect', 'transport close');
    fake.fire('connect');
    expect(fake.joins().at(-1)?.payload).toEqual({ joinCode: 'ABC234', accessToken: 'ABCDE23456' });
  });

  it('explains a token that no longer works', async () => {
    await renderPlay({ accessToken: 'ABCDE23456' });
    fake.fire('connect');
    act(() => fake.joins().at(-1)?.ack?.({ ok: false, error: 'invalid_access_token' }));
    expect(screen.getByText(/token is not valid/i)).toBeTruthy();
  });

  it('tells the server what device it is on, so the host can see it', async () => {
    Object.defineProperty(window.screen, 'width', { configurable: true, value: 390 });
    Object.defineProperty(window.screen, 'height', { configurable: true, value: 844 });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    try {
      await renderPlay();
      fake.fire('connect');
      expect(fake.joins().at(-1)?.payload).toMatchObject({
        client: { screenWidth: 390, screenHeight: 844, touch: true },
      });
    } finally {
      Object.defineProperty(window.screen, 'width', { configurable: true, value: 0 });
      Object.defineProperty(window.screen, 'height', { configurable: true, value: 0 });
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    }
  });
});

describe('Play proctoring in a live quiz', () => {
  const RUNNING = (proctored: boolean): RoomStatePayload => ({
    ...ROOM,
    proctored,
    status: 'running',
    currentQuestion: {
      questionId: '66666666-6666-4666-8666-666666666666',
      stem: 'Which one?',
      options: ['a', 'b', 'c', 'd'],
      startsAtServerMs: Date.now() - 1000,
      durationMs: 60_000,
      questionNumber: 1,
      totalQuestions: 2,
    },
  });

  function proctorEvents() {
    return fake.emitted.filter((entry) => entry.event === 'proctor:event');
  }

  async function startRunning(proctored: boolean) {
    await renderPlay();
    fake.fire('connect');
    act(() => fake.joins().at(-1)?.ack?.(OK));
    fake.fire('room:state', RUNNING(proctored));
  }

  it('tells students the session is proctored and sends their signals', async () => {
    await startRunning(true);
    expect(screen.getByText(/this session is proctored/i)).toBeTruthy();
    act(() => {
      document.dispatchEvent(new Event('contextmenu'));
    });
    expect(proctorEvents().map((entry) => (entry.payload as { type: string }).type)).toEqual([
      'right_click',
    ]);
  });

  it('never demands full screen in a quiz', async () => {
    await startRunning(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('says nothing and records nothing when the host chose no proctoring', async () => {
    await startRunning(false);
    expect(screen.queryByText(/proctored/i)).toBeNull();
    act(() => {
      document.dispatchEvent(new Event('contextmenu'));
    });
    expect(proctorEvents()).toHaveLength(0);
  });

  it('does not record anything while still waiting in the lobby', async () => {
    await renderPlay();
    fake.fire('connect');
    act(() => fake.joins().at(-1)?.ack?.(OK));
    fake.fire('room:state', { ...ROOM, proctored: true });
    act(() => {
      document.dispatchEvent(new Event('contextmenu'));
    });
    expect(proctorEvents()).toHaveLength(0);
  });

  it('shows the question’s picture with its description', async () => {
    await renderPlay();
    fake.fire('connect');
    act(() => fake.joins().at(-1)?.ack?.(OK));
    const running = RUNNING(false);
    fake.fire('room:state', {
      ...running,
      currentQuestion: {
        ...(running.currentQuestion as NonNullable<RoomStatePayload['currentQuestion']>),
        imageUrl: 'https://x.test/a.png',
        imageAlt: 'A cat on a sofa',
      },
    });
    expect(screen.getByRole('img', { name: 'A cat on a sofa' })).toBeTruthy();
  });
});
