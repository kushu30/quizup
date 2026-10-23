import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusPill } from './StatusPill';

afterEach(cleanup);

describe('StatusPill', () => {
  it('shows its label and marks its state', () => {
    render(<StatusPill status="live">Running</StatusPill>);
    expect(screen.getByText('Running').getAttribute('data-status')).toBe('live');
  });

  it('gives each state its own colour and mark, with the mark hidden from screen readers', () => {
    const { container, rerender } = render(<StatusPill status="waiting">Waiting</StatusPill>);
    const classes = new Set<string>();
    const marks = new Set<string>();
    for (const [status, label] of [
      ['waiting', 'Waiting'],
      ['live', 'Running'],
      ['ended', 'Ended'],
    ] as const) {
      rerender(<StatusPill status={status}>{label}</StatusPill>);
      classes.add(container.firstElementChild?.className ?? '');
      const mark = container.querySelector('[aria-hidden="true"]');
      marks.add(mark?.tagName === 'svg' ? 'svg' : (mark?.className ?? ''));
      expect(screen.getByText(label).textContent).toBe(label);
    }
    expect(classes.size).toBe(3);
    expect(marks.size).toBe(3);
  });

  it('does not animate', () => {
    const { container } = render(<StatusPill status="live">Running</StatusPill>);
    expect(container.innerHTML).not.toMatch(/animate-/);
  });
});
