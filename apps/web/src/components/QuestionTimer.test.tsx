import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuestionTimer } from './QuestionTimer';

afterEach(cleanup);

describe('QuestionTimer', () => {
  it('counts down to the start in whole seconds', () => {
    render(<QuestionTimer serverNowMs={1000} startsAtServerMs={3500} durationMs={20000} />);
    expect(screen.getByText('Get ready')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the seconds left and exposes them as a progress bar', () => {
    render(<QuestionTimer serverNowMs={10000} startsAtServerMs={5000} durationMs={20000} />);
    expect(screen.getByText('15')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Time left' });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('20');
    expect(bar.getAttribute('aria-valuenow')).toBe('15');
  });

  it('never shows negative time after the deadline', () => {
    render(<QuestionTimer serverNowMs={40000} startsAtServerMs={5000} durationMs={20000} />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });
});
