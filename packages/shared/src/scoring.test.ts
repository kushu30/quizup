import { describe, expect, it } from 'vitest';
import { ANSWER_GRACE_MS, computePoints, getAnswerWindowStatus } from './scoring.js';

describe('computePoints', () => {
  const durationMs = 20_000;

  it('awards 1000 for an instant correct answer', () => {
    expect(computePoints({ correct: true, responseMs: 0, durationMs })).toBe(1000);
  });

  it('awards 500 for a correct answer at the deadline', () => {
    expect(computePoints({ correct: true, responseMs: durationMs, durationMs })).toBe(500);
  });

  it('scales linearly in between', () => {
    expect(computePoints({ correct: true, responseMs: durationMs / 2, durationMs })).toBe(750);
    expect(computePoints({ correct: true, responseMs: 5000, durationMs })).toBe(875);
  });

  it('clamps response time into 0..durationMs', () => {
    expect(computePoints({ correct: true, responseMs: -300, durationMs })).toBe(1000);
    expect(computePoints({ correct: true, responseMs: durationMs + 250, durationMs })).toBe(500);
  });

  it('awards nothing for a wrong answer', () => {
    expect(computePoints({ correct: false, responseMs: 0, durationMs })).toBe(0);
  });
});

describe('getAnswerWindowStatus', () => {
  const startsAtServerMs = 10_000;
  const durationMs = 5000;
  const check = (receivedAtMs: number) =>
    getAnswerWindowStatus({ receivedAtMs, startsAtServerMs, durationMs });

  it('rejects answers before the question starts', () => {
    expect(check(startsAtServerMs - 1)).toBe('too_early');
  });

  it('accepts answers from the start through the deadline', () => {
    expect(check(startsAtServerMs)).toBe('ok');
    expect(check(startsAtServerMs + durationMs)).toBe('ok');
  });

  it('accepts answers inside the grace period', () => {
    expect(check(startsAtServerMs + durationMs + ANSWER_GRACE_MS)).toBe('ok');
  });

  it('rejects answers after the grace period', () => {
    expect(check(startsAtServerMs + durationMs + ANSWER_GRACE_MS + 1)).toBe('too_late');
  });

  it('honours a custom grace period', () => {
    const status = getAnswerWindowStatus({
      receivedAtMs: startsAtServerMs + durationMs + 101,
      startsAtServerMs,
      durationMs,
      graceMs: 100,
    });
    expect(status).toBe('too_late');
  });
});
