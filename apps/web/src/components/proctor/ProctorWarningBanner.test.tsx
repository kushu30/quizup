import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProctorWarningBanner } from './ProctorWarningBanner';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ProctorWarningBanner', () => {
  it('shows nothing without a warning', () => {
    const { container } = render(<ProctorWarningBanner warning={null} />);
    expect(container.textContent).toBe('');
  });

  it.each([
    ['face_missing', "We can't see your face. Please stay in view."],
    ['multiple_faces', 'We can see more than one face. Only you should be in view.'],
    ['looking_away', 'Please keep your eyes on the screen.'],
    ['camera_blocked', 'Your camera looks blocked. Please uncover it.'],
    ['loud_audio', 'We hear loud sound. Please keep the room quiet.'],
  ] as const)('says what is wrong for %s', (type, text) => {
    render(<ProctorWarningBanner warning={{ id: 1, type, count: 1, limit: null }} />);
    expect(screen.getByRole('status').textContent).toContain(text);
  });

  it('counts the flag, with the limit when there is one', () => {
    const { rerender } = render(
      <ProctorWarningBanner warning={{ id: 1, type: 'face_missing', count: 3, limit: 10 }} />,
    );
    expect(screen.getByRole('status').textContent).toContain('Flag 3 of 10');
    rerender(
      <ProctorWarningBanner warning={{ id: 2, type: 'face_missing', count: 2, limit: null }} />,
    );
    expect(screen.getByRole('status').textContent).toContain('Flag 2');
    expect(screen.getByRole('status').textContent).not.toContain(' of ');
  });

  it('warns plainly one flag before the exam is submitted, as an alert', () => {
    render(<ProctorWarningBanner warning={{ id: 1, type: 'loud_audio', count: 9, limit: 10 }} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('One more and your exam will be submitted.');
  });

  it('goes away after a while and returns for the next warning', () => {
    const { rerender } = render(
      <ProctorWarningBanner warning={{ id: 1, type: 'face_missing', count: 1, limit: null }} />,
    );
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(8100);
    });
    expect(screen.queryByRole('status')).toBeNull();
    rerender(
      <ProctorWarningBanner warning={{ id: 2, type: 'looking_away', count: 2, limit: null }} />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Please keep your eyes on the screen.',
    );
  });
});
