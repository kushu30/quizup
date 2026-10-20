import { describe, expect, it } from 'vitest';
import { formatDuration, formatPercent } from './formatDuration';

describe('formatDuration', () => {
  it('reads naturally at each scale', () => {
    expect(formatDuration(null)).toBe('Not recorded');
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
    expect(formatDuration(3_900_000)).toBe('1 h 5 min');
  });
});

describe('formatPercent', () => {
  it('rounds and handles no data', () => {
    expect(formatPercent(0.666)).toBe('67%');
    expect(formatPercent(null)).toBe('None');
  });
});
