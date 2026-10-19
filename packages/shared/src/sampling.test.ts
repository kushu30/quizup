import { describe, expect, it } from 'vitest';
import { createSeededRandom, pickWeighted, questionWeight } from './sampling.js';

describe('questionWeight with sigma 200', () => {
  it('centres on the player rating', () => {
    expect(questionWeight(800, 1000)).toBeCloseTo(0.606531, 5);
    expect(questionWeight(1000, 1000)).toBeCloseTo(1, 6);
    expect(questionWeight(1200, 1000)).toBeCloseTo(0.606531, 5);
  });

  it('shifts with the player rating', () => {
    expect(questionWeight(800, 800)).toBeCloseTo(1, 6);
    expect(questionWeight(1000, 800)).toBeCloseTo(0.606531, 5);
    expect(questionWeight(1200, 800)).toBeCloseTo(0.135335, 5);
  });

  it('has a floor of 0.01 far from the player', () => {
    expect(questionWeight(2500, 1000)).toBe(0.01);
    expect(questionWeight(100, 1500)).toBe(0.01);
  });
});

describe('pickWeighted', () => {
  const candidates = [{ rating: 800 }, { rating: 1000 }, { rating: 1200 }];

  it('walks the cumulative weights with a single draw', () => {
    expect(pickWeighted(candidates, 1000, { next: () => 0.2 })?.rating).toBe(800);
    expect(pickWeighted(candidates, 1000, { next: () => 0.3 })?.rating).toBe(1000);
    expect(pickWeighted(candidates, 1000, { next: () => 0.8 })?.rating).toBe(1200);
  });

  it('returns null without candidates and handles a draw of almost 1', () => {
    expect(pickWeighted([], 1000, { next: () => 0.5 })).toBeNull();
    expect(pickWeighted(candidates, 1000, { next: () => 0.999999 })?.rating).toBe(1200);
  });

  it('prefers the near-rating question over the far one with a seeded generator', () => {
    const random = createSeededRandom(12345);
    const counts = new Map<number, number>();
    for (let draw = 0; draw < 5000; draw += 1) {
      const picked = pickWeighted(candidates, 1000, random);
      counts.set(picked?.rating ?? 0, (counts.get(picked?.rating ?? 0) ?? 0) + 1);
    }
    const near = counts.get(1000) ?? 0;
    const far = counts.get(1200) ?? 0;
    expect(near).toBeGreaterThan(far * 1.3);
    expect(near / 5000).toBeGreaterThan(0.4);
    expect(near / 5000).toBeLessThan(0.5);
  });

  it('favours a far question much less when the gap is large', () => {
    const wide = [{ rating: 1000 }, { rating: 1800 }];
    const random = createSeededRandom(99);
    let farPicks = 0;
    for (let draw = 0; draw < 2000; draw += 1) {
      if (pickWeighted(wide, 1000, random)?.rating === 1800) {
        farPicks += 1;
      }
    }
    expect(farPicks / 2000).toBeLessThan(0.02);
  });
});

describe('createSeededRandom', () => {
  it('is deterministic and within [0, 1)', () => {
    const first = createSeededRandom(7);
    const second = createSeededRandom(7);
    for (let draw = 0; draw < 100; draw += 1) {
      const value = first.next();
      expect(value).toBe(second.next());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
