import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';

const LINK = 'https://quizup-khaki.vercel.app/join/K7M2QX';

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CopyButton', () => {
  it('copies the text and says so, then resets', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    mockClipboard(writeText);
    render(<CopyButton text={LINK} label="Copy link" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    });
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(screen.getByRole('status').textContent).toBe('Link copied');
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows the link to copy by hand when the clipboard is blocked', async () => {
    mockClipboard(vi.fn(async () => Promise.reject(new Error('denied'))));
    render(<CopyButton text={LINK} label="Copy link" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    });
    expect(screen.getByRole('status').textContent).toBe(
      'Copy failed. Select the link and copy it.',
    );
  });
});
