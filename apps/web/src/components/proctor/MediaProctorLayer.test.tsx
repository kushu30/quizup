import type { ProctorEventPayload } from '@quizup/shared';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaProctorLayer } from './MediaProctorLayer';

const hook = vi.hoisted(() => ({ options: null as null | Record<string, unknown> }));
const store = vi.hoisted(() => ({ releaseMedia: vi.fn() }));
vi.mock('../../lib/proctorMedia/mediaStreamStore', () => ({ releaseMedia: store.releaseMedia }));
vi.mock('../../hooks/useMediaProctor', () => ({
  useMediaProctor: (options: Record<string, unknown>) => {
    hook.options = options;
    return { camera: 'ready', mic: options.mic ? 'ready' : null };
  },
}));

type Listener = (payload: unknown) => void;

function fakeSocket() {
  const listeners = new Map<string, Listener[]>();
  return {
    emitted: [] as { event: string; payload: unknown }[],
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    off(event: string, listener: Listener) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
      );
    },
    emit(event: string, payload: unknown) {
      this.emitted.push({ event, payload });
    },
    receive(event: string, payload: unknown) {
      for (const listener of listeners.get(event) ?? []) {
        listener(payload);
      }
    },
  };
}

let socket: ReturnType<typeof fakeSocket>;
let nowMs: number;

function mount(
  overrides: Partial<{
    proctorCamera: boolean;
    proctorMic: boolean;
    proctorFlagLimit: number | null;
    active: boolean;
    connected: boolean;
  }> = {},
) {
  return render(
    <MediaProctorLayer
      socket={socket as never}
      room={{
        proctorCamera: overrides.proctorCamera ?? true,
        proctorMic: overrides.proctorMic ?? false,
        proctorFlagLimit: overrides.proctorFlagLimit ?? null,
      }}
      active={overrides.active ?? true}
      connected={overrides.connected ?? true}
      now={() => nowMs}
    />,
  );
}

function flag(count: number, type = 'face_missing', limit: number | null = 10) {
  act(() => socket.receive('proctor:flags', { count, limit, type }));
}

beforeEach(() => {
  socket = fakeSocket();
  nowMs = 1_000_000;
  hook.options = null;
  store.releaseMedia.mockClear();
});
afterEach(cleanup);

describe('MediaProctorLayer', () => {
  it('turns detection on only while the session is active', () => {
    mount({ active: false });
    expect(hook.options).toMatchObject({ enabled: false, camera: true, mic: false });
  });

  it('shows nothing when the host turned neither device on', () => {
    const { container } = mount({ proctorCamera: false, proctorMic: false });
    expect(container.textContent).toBe('');
    expect(hook.options).toMatchObject({ enabled: false });
  });

  it('sends each flag to the server as a proctor event', () => {
    mount();
    const event = { type: 'face_missing', clientAt: 5 } as ProctorEventPayload;
    (hook.options?.send as (event: ProctorEventPayload) => void)(event);
    expect(socket.emitted).toEqual([{ event: 'proctor:event', payload: event }]);
  });

  it('shows the devices that are on', () => {
    mount({ proctorMic: true });
    expect(screen.getByText('Camera on')).toBeTruthy();
    expect(screen.getByText('Mic on')).toBeTruthy();
  });

  it('warns the student and counts toward the limit', () => {
    mount({ proctorFlagLimit: 10 });
    flag(3);
    expect(screen.getByRole('status').textContent).toContain("We can't see your face");
    expect(screen.getByText('Flags 3 of 10')).toBeTruthy();
  });

  it('does not repeat the same warning within 30 seconds, but keeps counting', () => {
    mount({ proctorFlagLimit: 10 });
    flag(1);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    nowMs += 10_000;
    flag(2, 'face_missing');
    expect(screen.getByText('Flags 2 of 10')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Flag 1 of 10');
    nowMs += 25_000;
    flag(3, 'face_missing');
    expect(screen.getByRole('status').textContent).toContain('Flag 3 of 10');
  });

  it('always shows the final warning, even right after another warning', () => {
    mount({ proctorFlagLimit: 10 });
    flag(1, 'face_missing');
    nowMs += 1000;
    flag(9, 'face_missing');
    expect(screen.getByRole('alert').textContent).toContain(
      'One more and your exam will be submitted.',
    );
  });

  it('warns about a different problem straight away', () => {
    mount({ proctorFlagLimit: 10 });
    flag(1, 'face_missing');
    nowMs += 1000;
    flag(2, 'loud_audio');
    expect(screen.getByRole('status').textContent).toContain('loud sound');
  });

  it('stops listening for flags when it goes away', () => {
    const { unmount } = mount({ proctorFlagLimit: 10 });
    unmount();
    expect(() => flag(1)).not.toThrow();
  });

  it('turns the camera and microphone off when it goes away', () => {
    const { unmount } = mount();
    expect(store.releaseMedia).not.toHaveBeenCalled();
    unmount();
    expect(store.releaseMedia).toHaveBeenCalledTimes(1);
  });

  it('holds flags raised while the connection is down and sends them, in order, when it is back', () => {
    const { rerender } = mount({ connected: false });
    const send = hook.options?.send as (event: ProctorEventPayload) => void;
    const first = { type: 'face_missing', clientAt: 1 } as ProctorEventPayload;
    const second = { type: 'loud_audio', clientAt: 2 } as ProctorEventPayload;
    send(first);
    send(second);
    expect(socket.emitted).toEqual([]);
    rerender(
      <MediaProctorLayer
        socket={socket as never}
        room={{ proctorCamera: true, proctorMic: false, proctorFlagLimit: null }}
        active
        connected
        now={() => nowMs}
      />,
    );
    expect(socket.emitted.map((entry) => entry.payload)).toEqual([first, second]);
    send({ type: 'face_missing', clientAt: 3 } as ProctorEventPayload);
    expect(socket.emitted).toHaveLength(3);
  });

  it('keeps only the newest 200 flags while offline', () => {
    const { rerender } = mount({ connected: false });
    const send = hook.options?.send as (event: ProctorEventPayload) => void;
    for (let index = 1; index <= 205; index += 1) {
      send({ type: 'face_missing', clientAt: index } as ProctorEventPayload);
    }
    rerender(
      <MediaProctorLayer
        socket={socket as never}
        room={{ proctorCamera: true, proctorMic: false, proctorFlagLimit: null }}
        active
        connected
        now={() => nowMs}
      />,
    );
    const times = socket.emitted.map((entry) => (entry.payload as { clientAt: number }).clientAt);
    expect(times).toHaveLength(200);
    expect(times[0]).toBe(6);
    expect(times.at(-1)).toBe(205);
  });

  it('keeps room for a warning so the page does not jump when one appears', () => {
    mount();
    expect(screen.getByTestId('warning-slot').className).toMatch(/min-h-/);
  });
});
