import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageLoader, Skeleton, SkeletonList } from './Loader';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PageLoader', () => {
  it('announces what it is doing and draws the animated mark', () => {
    const { container } = render(<PageLoader label="Loading..." />);
    expect(screen.getByRole('status').textContent).toContain('Loading...');
    expect(container.querySelectorAll('svg rect.animate-tile')).toHaveLength(4);
  });

  it('stays quiet at first, then says the server may be waking up', () => {
    render(<PageLoader label="Connecting..." />);
    expect(screen.queryByText(/taking longer than usual/i)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.getByText(/taking longer than usual/i)).toBeTruthy();
  });

  it('can sit inline without the big padding', () => {
    render(<PageLoader label="Loading..." compact />);
    expect(screen.getByRole('status').className).not.toContain('py-16');
  });
});

describe('Skeleton', () => {
  it('is hidden from screen readers and shimmers', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const block = container.firstElementChild;
    expect(block?.getAttribute('aria-hidden')).toBe('true');
    expect(block?.className).toContain('animate-shimmer');
  });

  it('makes a list of placeholder rows', () => {
    const { container } = render(<SkeletonList rows={3} />);
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(3);
  });
});
