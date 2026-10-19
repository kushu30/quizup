import {
  PROCTOR_CLIENT_QUEUE_LIMIT,
  PROCTOR_RESIZE_DEBOUNCE_MS,
  PROCTOR_RESIZE_MIN_DELTA_PX,
  type ProctorEventPayload,
} from '@quizup/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseProctorOptions {
  enabled: boolean;
  connected: boolean;
  send: (event: ProctorEventPayload) => void;
  now?: () => number;
}

interface UseProctorResult {
  fullscreenLost: boolean;
  requestFullscreen: () => Promise<void>;
  queuedCount: number;
}

type AwaySource = 'tab_switch' | 'window_blur';

export function useProctor(options: UseProctorOptions): UseProctorResult {
  const { enabled, connected } = options;
  const sendRef = useRef(options.send);
  const nowRef = useRef(options.now ?? Date.now);
  const connectedRef = useRef(connected);
  const queueRef = useRef<ProctorEventPayload[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [fullscreenLost, setFullscreenLost] = useState(false);

  sendRef.current = options.send;
  nowRef.current = options.now ?? Date.now;
  connectedRef.current = connected;

  const dispatch = useCallback((event: ProctorEventPayload) => {
    if (connectedRef.current) {
      sendRef.current(event);
      return;
    }
    const queue = queueRef.current;
    if (queue.length >= PROCTOR_CLIENT_QUEUE_LIMIT) {
      queue.shift();
    }
    queue.push(event);
    setQueuedCount(queue.length);
  }, []);

  useEffect(() => {
    if (!connected || queueRef.current.length === 0) {
      return;
    }
    const pending = queueRef.current;
    queueRef.current = [];
    setQueuedCount(0);
    for (const event of pending) {
      sendRef.current(event);
    }
  }, [connected]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let hiddenAt: number | null = null;
    let blurredAt: number | null = null;
    let wasFullscreen = Boolean(document.fullscreenElement);
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    setFullscreenLost(!wasFullscreen);

    const stamp = () => Math.round(nowRef.current());

    const emitReturn = (from: AwaySource, awaySince: number) => {
      dispatch({
        type: 'focus_return',
        clientAt: stamp(),
        detail: { durationMs: Math.max(Math.round(nowRef.current() - awaySince), 0), from },
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = nowRef.current();
        dispatch({ type: 'tab_switch', clientAt: stamp() });
      } else if (hiddenAt !== null) {
        emitReturn('tab_switch', hiddenAt);
        hiddenAt = null;
      }
    };

    const onBlur = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
      }
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (document.visibilityState === 'visible' && hiddenAt === null && blurredAt === null) {
          blurredAt = nowRef.current();
          dispatch({ type: 'window_blur', clientAt: stamp() });
        }
      }, 0);
    };

    const onFocus = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      if (blurredAt !== null) {
        emitReturn('window_blur', blurredAt);
        blurredAt = null;
      }
    };

    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      if (!active && wasFullscreen) {
        dispatch({ type: 'fullscreen_exit', clientAt: stamp() });
      }
      wasFullscreen = active;
      setFullscreenLost(!active);
    };

    const selectionLength = () => window.getSelection()?.toString().length ?? 0;

    const onCopy = () => {
      dispatch({
        type: 'copy',
        clientAt: stamp(),
        detail: { length: selectionLength(), cut: false },
      });
    };

    const onCut = () => {
      dispatch({
        type: 'copy',
        clientAt: stamp(),
        detail: { length: selectionLength(), cut: true },
      });
    };

    const onPaste = (event: Event) => {
      const data = (event as ClipboardEvent).clipboardData;
      dispatch({
        type: 'paste',
        clientAt: stamp(),
        detail: { length: data?.getData('text')?.length ?? 0 },
      });
    };

    const onContextMenu = () => {
      dispatch({ type: 'right_click', clientAt: stamp() });
    };

    const onResize = () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        const width = window.innerWidth;
        const height = window.innerHeight;
        if (
          Math.abs(width - lastWidth) >= PROCTOR_RESIZE_MIN_DELTA_PX ||
          Math.abs(height - lastHeight) >= PROCTOR_RESIZE_MIN_DELTA_PX
        ) {
          lastWidth = width;
          lastHeight = height;
          dispatch({ type: 'resize', clientAt: stamp(), detail: { width, height } });
        }
      }, PROCTOR_RESIZE_DEBOUNCE_MS);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      if (blurTimer) {
        clearTimeout(blurTimer);
      }
    };
  }, [enabled, dispatch]);

  const requestFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      return;
    }
  }, []);

  return { fullscreenLost, requestFullscreen, queuedCount };
}
