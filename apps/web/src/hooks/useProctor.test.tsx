import {
  PROCTOR_CLIENT_QUEUE_LIMIT,
  proctorEventPayloadSchema,
  type ProctorEventPayload,
} from '@quizup/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProctor } from './useProctor';

let visibility: 'visible' | 'hidden' = 'visible';
let fullscreenElement: Element | null = document.documentElement;
let selectionText = '';

function setVisibility(next: 'visible' | 'hidden') {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

function setFullscreen(active: boolean) {
  fullscreenElement = active ? document.documentElement : null;
  document.dispatchEvent(new Event('fullscreenchange'));
}

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function renderProctor(initial: { enabled?: boolean; connected?: boolean } = {}) {
  const sent: ProctorEventPayload[] = [];
  const clock = { value: 1_800_000_000_000 };
  const hook = renderHook(
    (props: { enabled: boolean; connected: boolean }) =>
      useProctor({
        enabled: props.enabled,
        connected: props.connected,
        send: (event) => sent.push(event),
        now: () => clock.value,
      }),
    { initialProps: { enabled: initial.enabled ?? true, connected: initial.connected ?? true } },
  );
  return { sent, clock, ...hook };
}

describe('useProctor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    fullscreenElement = document.documentElement;
    selectionText = '';
    setWindowSize(1280, 800);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    window.getSelection = (() => ({
      toString: () => selectionText,
    })) as unknown as typeof window.getSelection;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a tab switch and the time away when the tab returns', () => {
    const { sent, clock } = renderProctor();
    act(() => setVisibility('hidden'));
    clock.value += 4200;
    act(() => setVisibility('visible'));

    expect(sent.map((event) => event.type)).toEqual(['tab_switch', 'focus_return']);
    expect(sent[1]).toMatchObject({ detail: { durationMs: 4200, from: 'tab_switch' } });
  });

  it('reports a window blur only while the document is still visible', () => {
    const { sent, clock } = renderProctor();
    act(() => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(0);
    });
    clock.value += 1500;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(sent.map((event) => event.type)).toEqual(['window_blur', 'focus_return']);
    expect(sent[1]).toMatchObject({ detail: { durationMs: 1500, from: 'window_blur' } });

    sent.length = 0;
    act(() => {
      visibility = 'hidden';
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(0);
    });
    expect(sent.map((event) => event.type)).not.toContain('window_blur');
  });

  it('reports leaving fullscreen and shows the overlay until it is re-requested', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = requestFullscreen;
    const { sent, result } = renderProctor();
    expect(result.current.fullscreenLost).toBe(false);

    act(() => setFullscreen(false));
    expect(sent.map((event) => event.type)).toEqual(['fullscreen_exit']);
    expect(result.current.fullscreenLost).toBe(true);

    await act(async () => {
      await result.current.requestFullscreen();
    });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    act(() => setFullscreen(true));
    expect(result.current.fullscreenLost).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('shows the overlay without a fullscreen_exit event when the exam starts outside fullscreen', () => {
    fullscreenElement = null;
    const { sent, result } = renderProctor();
    expect(result.current.fullscreenLost).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('logs copy, cut and paste by length only', () => {
    const { sent } = renderProctor();
    selectionText = 'twelve chars';
    act(() => {
      document.dispatchEvent(new Event('copy'));
      document.dispatchEvent(new Event('cut'));
      const paste = new Event('paste');
      Object.defineProperty(paste, 'clipboardData', {
        value: { getData: () => 'secret clipboard text' },
      });
      document.dispatchEvent(paste);
    });

    expect(sent).toEqual([
      expect.objectContaining({ type: 'copy', detail: { length: 12, cut: false } }),
      expect.objectContaining({ type: 'copy', detail: { length: 12, cut: true } }),
      expect.objectContaining({ type: 'paste', detail: { length: 21 } }),
    ]);
    expect(JSON.stringify(sent)).not.toContain('secret');
    expect(JSON.stringify(sent)).not.toContain('twelve');
  });

  it('logs right-clicks', () => {
    const { sent } = renderProctor();
    act(() => {
      document.dispatchEvent(new Event('contextmenu'));
    });
    expect(sent.map((event) => event.type)).toEqual(['right_click']);
  });

  it('debounces resizes by 500 ms and ignores changes under 20 px', () => {
    const { sent } = renderProctor();

    act(() => {
      setWindowSize(1290, 805);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(600);
    });
    expect(sent).toHaveLength(0);

    act(() => {
      setWindowSize(1000, 700);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(200);
      setWindowSize(900, 650);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(499);
    });
    expect(sent).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'resize', detail: { width: 900, height: 650 } });

    act(() => {
      setWindowSize(910, 655);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(600);
    });
    expect(sent).toHaveLength(1);
  });

  it('captures nothing while disabled and stops after unmount', () => {
    const disabled = renderProctor({ enabled: false });
    act(() => {
      document.dispatchEvent(new Event('contextmenu'));
      document.dispatchEvent(new Event('copy'));
      setVisibility('hidden');
    });
    expect(disabled.sent).toHaveLength(0);
    visibility = 'visible';

    const active = renderProctor();
    active.unmount();
    act(() => {
      document.dispatchEvent(new Event('contextmenu'));
    });
    expect(active.sent).toHaveLength(0);

    const toggled = renderProctor({ enabled: false });
    toggled.rerender({ enabled: true, connected: true });
    act(() => {
      document.dispatchEvent(new Event('contextmenu'));
    });
    expect(toggled.sent).toHaveLength(1);
  });

  it('queues events while disconnected, keeps clientAt, and sends them in order on reconnect', () => {
    const { sent, clock, rerender, result } = renderProctor({ connected: false });
    act(() => {
      clock.value += 100;
      document.dispatchEvent(new Event('contextmenu'));
      clock.value += 100;
      setVisibility('hidden');
      clock.value += 100;
      setVisibility('visible');
    });
    expect(sent).toHaveLength(0);
    expect(result.current.queuedCount).toBe(3);

    clock.value += 60_000;
    rerender({ enabled: true, connected: true });

    expect(sent.map((event) => event.type)).toEqual(['right_click', 'tab_switch', 'focus_return']);
    expect(sent.map((event) => event.clientAt)).toEqual([
      1_800_000_000_100, 1_800_000_000_200, 1_800_000_000_300,
    ]);
    expect(result.current.queuedCount).toBe(0);
  });

  it('bounds the offline queue to 200 events and keeps the newest', () => {
    const { sent, clock, rerender, result } = renderProctor({ connected: false });
    act(() => {
      for (let index = 0; index < PROCTOR_CLIENT_QUEUE_LIMIT + 50; index += 1) {
        clock.value += 1;
        document.dispatchEvent(new Event('contextmenu'));
      }
    });
    expect(result.current.queuedCount).toBe(PROCTOR_CLIENT_QUEUE_LIMIT);

    rerender({ enabled: true, connected: true });
    expect(sent).toHaveLength(PROCTOR_CLIENT_QUEUE_LIMIT);
    expect(sent[0]?.clientAt).toBe(1_800_000_000_000 + 51);
    expect(sent[sent.length - 1]?.clientAt).toBe(1_800_000_000_000 + 250);
  });

  it('only produces events that pass the shared schema', () => {
    const { sent, clock } = renderProctor();
    selectionText = 'abc';
    act(() => {
      setVisibility('hidden');
      clock.value += 10;
      setVisibility('visible');
      document.dispatchEvent(new Event('copy'));
      document.dispatchEvent(new Event('contextmenu'));
      setFullscreen(false);
      setWindowSize(500, 500);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(600);
    });
    expect(sent.length).toBeGreaterThanOrEqual(6);
    for (const event of sent) {
      expect(proctorEventPayloadSchema.safeParse(event).success).toBe(true);
    }
  });
});
