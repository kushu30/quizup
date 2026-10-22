import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroDemo } from './HeroDemo';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('HeroDemo', () => {
  it('starts on the join code and lets the visitor join from the phone', () => {
    render(<HeroDemo />);
    expect(screen.getAllByText('K7M2QX').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByText('Tap an answer')).toBeTruthy();
  });

  it('moves the host chart when an answer is tapped, then shows the result', () => {
    render(<HeroDemo />);
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByText('0 of 8 answered')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Read committed/ }));
    expect(screen.getByText('1 of 8 answered')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByRole('status').textContent).toContain('Correct');
  });

  it('shows a wrong answer as not quite', () => {
    render(<HeroDemo />);
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    fireEvent.click(screen.getByRole('button', { name: /Serializable/ }));
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByRole('status').textContent).toContain('Not quite');
  });

  it('jumps to a step from the step list and pauses', () => {
    render(<HeroDemo />);
    fireEvent.click(screen.getByRole('button', { name: /Leaderboard/ }));
    expect(screen.getByText('Final leaderboard')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });
});
