import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDemo } from './LiveDemo';

const pulse = vi.hoisted(() => ({
  value: { state: 'online' as 'checking' | 'online' | 'offline', latencyMs: 42 as number | null },
}));

vi.mock('../../lib/useServerPulse', () => ({ useServerPulse: () => pulse.value }));

beforeEach(() => {
  vi.useFakeTimers();
  pulse.value = { state: 'online', latencyMs: 42 };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function goToStep(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('LiveDemo question', () => {
  it('uses a generic question for a visitor who is not signed in', () => {
    render(<LiveDemo name={null} />);
    goToStep(/step 3/i);
    expect(
      screen.getByText(
        'Which isolation level prevents dirty reads but allows non-repeatable reads?',
      ),
    ).toBeTruthy();
  });

  it('puts the signed-in name in the question', () => {
    render(<LiveDemo name="Priya Nair" />);
    goToStep(/step 3/i);
    expect(
      screen.getByText(
        'Priya, which isolation level prevents dirty reads but allows non-repeatable reads?',
      ),
    ).toBeTruthy();
  });
});

describe('LiveDemo flow', () => {
  it('opens on the student view and switches to the host view', () => {
    render(<LiveDemo name={null} />);
    const student = screen.getByRole('tab', { name: 'Student view' });
    const host = screen.getByRole('tab', { name: 'Host view' });
    expect(student.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(host);
    expect(host.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toContain('Join code');
  });

  it('lets a visitor answer and tells them how they did', () => {
    render(<LiveDemo name={null} />);
    goToStep(/step 3/i);
    fireEvent.click(screen.getByRole('button', { name: /Repeatable read/ }));
    expect(screen.getByRole('status', { name: 'Answer result' }).textContent).toMatch(/Not quite/);
    goToStep(/step 3/i);
    fireEvent.click(screen.getByRole('button', { name: /Read committed/ }));
    expect(screen.getByRole('status', { name: 'Answer result' }).textContent).toMatch(/Correct/);
  });

  it('moves along by itself and stops when paused', () => {
    render(<LiveDemo name={null} />);
    const current = () =>
      screen
        .getAllByRole('button', { name: /^Step \d/ })
        .find((b) => b.getAttribute('aria-current') === 'step')?.textContent;
    expect(current()).toBe('1');
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(current()).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Pause demo' }));
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(current()).toBe('2');
    expect(screen.getByRole('button', { name: 'Play demo' })).toBeTruthy();
  });

  it('shows the host the leaderboard with the visitor in it at the end', () => {
    render(<LiveDemo name="Priya Nair" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Host view' }));
    goToStep(/step 5/i);
    expect(screen.getByRole('tabpanel').textContent).toContain('Priya');
  });
});

describe('LiveDemo live data', () => {
  it('shows the real server status and speed', () => {
    render(<LiveDemo name={null} />);
    expect(screen.getByText(/Server online/).textContent).toContain('42 ms');
  });

  it('says honestly when the server cannot be reached', () => {
    pulse.value = { state: 'offline', latencyMs: null };
    render(<LiveDemo name={null} />);
    expect(screen.getByText(/Server unreachable/)).toBeTruthy();
  });

  it('shows a clock that follows the real time', () => {
    vi.setSystemTime(new Date('2026-10-20T10:42:07'));
    render(<LiveDemo name={null} />);
    expect(screen.getByLabelText('Local time').textContent).toContain('10:42:07');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Local time').textContent).toContain('10:42:08');
  });

  it('labels the walkthrough as simulated', () => {
    render(<LiveDemo name={null} />);
    expect(screen.getByText(/simulated walkthrough/i)).toBeTruthy();
  });
});
