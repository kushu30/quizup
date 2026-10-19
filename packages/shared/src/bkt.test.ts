import { describe, expect, it } from 'vitest';
import { bktUpdate, normalizeTopicKey } from './bkt.js';

describe('bktUpdate with default parameters', () => {
  it('raises mastery after a correct answer', () => {
    expect(bktUpdate(0.3, true)).toBeCloseTo(0.7097561, 6);
  });

  it('lowers mastery after a wrong answer', () => {
    expect(bktUpdate(0.3, false)).toBeCloseTo(0.1932203, 6);
  });

  it('increases monotonically over correct answers and stays below 1', () => {
    let mastery = 0.3;
    for (let step = 0; step < 3; step += 1) {
      const next = bktUpdate(mastery, true);
      expect(next).toBeGreaterThan(mastery);
      expect(next).toBeLessThan(1);
      mastery = next;
    }
  });

  it('never leaves 0..1', () => {
    for (const start of [0, 0.0001, 0.5, 0.9999, 1]) {
      for (const correct of [true, false]) {
        const next = bktUpdate(start, correct);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(1);
      }
    }
    let mastery = 0.3;
    for (let step = 0; step < 200; step += 1) {
      mastery = bktUpdate(mastery, step % 7 !== 0);
      expect(mastery).toBeGreaterThanOrEqual(0);
      expect(mastery).toBeLessThanOrEqual(1);
    }
  });

  it('honours custom parameters', () => {
    const next = bktUpdate(0.5, true, { pInit: 0.5, pLearn: 0, pSlip: 0, pGuess: 0.5 });
    expect(next).toBeCloseTo(1 / 1.5, 9);
  });
});

describe('normalizeTopicKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeTopicKey('  Linear Algebra ')).toBe('linear algebra');
  });
});
