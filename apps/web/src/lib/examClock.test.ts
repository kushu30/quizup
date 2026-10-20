import { describe, expect, it } from 'vitest';
import { clockLabelFor, formatClock, urgencyOf } from './examClock';

const MINUTE = 60_000;

describe('formatClock', () => {
  it('shows minutes and seconds, rounding up and never going negative', () => {
    expect(formatClock(20 * MINUTE)).toBe('20:00');
    expect(formatClock(61_001)).toBe('1:02');
    expect(formatClock(999)).toBe('0:01');
    expect(formatClock(-5000)).toBe('0:00');
  });

  it('adds an hour part for long exams', () => {
    expect(formatClock(95 * MINUTE + 5000)).toBe('1:35:05');
    expect(formatClock(60 * MINUTE)).toBe('1:00:00');
  });
});

describe('urgencyOf', () => {
  it('is calm above ten minutes, soon up to the last minute, urgent in the last minute', () => {
    expect(urgencyOf(10 * MINUTE + 1)).toBe('calm');
    expect(urgencyOf(10 * MINUTE)).toBe('soon');
    expect(urgencyOf(MINUTE + 1)).toBe('soon');
    expect(urgencyOf(MINUTE)).toBe('urgent');
    expect(urgencyOf(0)).toBe('urgent');
  });
});

describe('clockLabelFor', () => {
  it('keeps one label until a milestone, then names the milestone', () => {
    expect(clockLabelFor(30 * MINUTE)).toBe('Time left');
    expect(clockLabelFor(10 * MINUTE)).toBe('10 minutes left');
    expect(clockLabelFor(7 * MINUTE)).toBe('10 minutes left');
    expect(clockLabelFor(5 * MINUTE)).toBe('5 minutes left');
    expect(clockLabelFor(MINUTE)).toBe('Last minute');
  });
});
