import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoDismiss } from './useAutoDismiss';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoDismiss', () => {
  it('fades the message out and then clears it', () => {
    const clear = vi.fn();
    const { result } = renderHook(() => useAutoDismiss('Something went wrong', clear, 1000));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(result.current).toBe(true);
    expect(clear).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('starts again when a new message replaces the old one', () => {
    const clear = vi.fn();
    const { rerender } = renderHook(({ message }) => useAutoDismiss(message, clear, 1000), {
      initialProps: { message: 'First problem' },
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    rerender({ message: 'Second problem' });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(clear).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('does nothing while there is no message', () => {
    const clear = vi.fn();
    renderHook(() => useAutoDismiss(null, clear, 1000));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(clear).not.toHaveBeenCalled();
  });
});
