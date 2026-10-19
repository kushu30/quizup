import { describe, expect, it } from 'vitest';
import {
  MIN_CONFIDENT_SAMPLE,
  addRegressionPoint,
  applyParticipantResponse,
  applyQuestionResponse,
  bucketIndex,
  difficultyMismatch,
  emptyParticipantAggregate,
  emptyQuestionAggregate,
  emptyRegressionSums,
  medianOf,
  projectScore,
  type RegressionSums,
} from './analytics.js';

function sumsFor(points: [number, number][]): RegressionSums {
  return points.reduce((sums, [x, y]) => addRegressionPoint(sums, x, y), emptyRegressionSums());
}

describe('bucketIndex', () => {
  it('puts 0 percent in the first bucket', () => {
    expect(bucketIndex(0, 1000)).toBe(0);
  });

  it('puts exactly 10 percent in the second bucket and 9.99 percent in the first', () => {
    expect(bucketIndex(100, 1000)).toBe(1);
    expect(bucketIndex(99, 1000)).toBe(0);
  });

  it('puts every decile boundary in the bucket that starts there', () => {
    for (let bucket = 0; bucket < 10; bucket += 1) {
      expect(bucketIndex(bucket * 300, 3000)).toBe(bucket);
    }
  });

  it('puts exactly 100 percent in the last bucket', () => {
    expect(bucketIndex(1000, 1000)).toBe(9);
    expect(bucketIndex(999, 1000)).toBe(9);
  });

  it('clamps a late response into the last bucket and a negative one into the first', () => {
    expect(bucketIndex(1200, 1000)).toBe(9);
    expect(bucketIndex(-5, 1000)).toBe(0);
  });

  it('handles an invalid duration', () => {
    expect(bucketIndex(500, 0)).toBe(0);
    expect(bucketIndex(Number.NaN, 1000)).toBe(0);
  });
});

describe('projectScore', () => {
  const base = { totalRounds: 10, roundsCompleted: 3, adaptive: false };

  it('gives the known slope and projection for linear points', () => {
    const sums = sumsFor([
      [1, 100],
      [2, 200],
      [3, 300],
    ]);
    const result = projectScore({ ...base, sums, currentScore: 300 });
    expect(result?.slope).toBeCloseTo(100, 9);
    expect(result?.projected).toBeCloseTo(1000, 9);
    expect(result?.n).toBe(3);
  });

  it('fits points that are not collinear by least squares', () => {
    const sums = sumsFor([
      [1, 500],
      [2, 1000],
      [3, 1000],
      [4, 1900],
    ]);
    const result = projectScore({ ...base, roundsCompleted: 4, sums, currentScore: 1900 });
    expect(result?.slope).toBeCloseTo(420, 9);
    expect(result?.projected).toBeCloseTo(4250, 9);
  });

  it('returns null with fewer than three answers', () => {
    expect(
      projectScore({
        ...base,
        sums: sumsFor([
          [1, 100],
          [2, 200],
        ]),
        currentScore: 200,
      }),
    ).toBeNull();
    expect(projectScore({ ...base, sums: emptyRegressionSums(), currentScore: 0 })).toBeNull();
  });

  it('returns null when the total rounds are unknown', () => {
    const sums = sumsFor([
      [1, 100],
      [2, 200],
      [3, 300],
    ]);
    expect(projectScore({ ...base, totalRounds: null, sums, currentScore: 300 })).toBeNull();
  });

  it('never projects below the current score', () => {
    const sums = sumsFor([
      [1, 1000],
      [2, 900],
      [3, 800],
    ]);
    const result = projectScore({ ...base, sums, currentScore: 800 });
    expect(result?.slope).toBeCloseTo(-100, 9);
    expect(result?.projected).toBe(800);
  });

  it('never projects above the current score plus remaining rounds times 1000', () => {
    const sums = sumsFor([
      [1, 0],
      [2, 5000],
      [3, 10000],
    ]);
    const result = projectScore({
      sums,
      currentScore: 10000,
      totalRounds: 4,
      roundsCompleted: 3,
      adaptive: false,
    });
    expect(result?.projected).toBe(11000);
  });

  it('projects exactly the current score when no rounds remain', () => {
    const sums = sumsFor([
      [1, 100],
      [2, 200],
      [3, 300],
    ]);
    const result = projectScore({
      sums,
      currentScore: 300,
      totalRounds: 3,
      roundsCompleted: 3,
      adaptive: false,
    });
    expect(result?.projected).toBe(300);
  });

  it('flags low confidence below the named sample size and clears it at the boundary', () => {
    expect(MIN_CONFIDENT_SAMPLE).toBe(6);
    const points: [number, number][] = [1, 2, 3, 4, 5, 6].map((x) => [x, x * 100]);
    const five = projectScore({
      ...base,
      sums: sumsFor(points.slice(0, 5)),
      currentScore: 500,
    });
    const six = projectScore({ ...base, sums: sumsFor(points), currentScore: 600 });
    expect(five?.lowConfidence).toBe(true);
    expect(six?.lowConfidence).toBe(false);
  });

  it('forces low confidence in adaptive sessions regardless of sample size', () => {
    const points: [number, number][] = [1, 2, 3, 4, 5, 6, 7, 8].map((x) => [x, x * 100]);
    const result = projectScore({
      sums: sumsFor(points),
      currentScore: 800,
      totalRounds: 10,
      roundsCompleted: 8,
      adaptive: true,
    });
    expect(result?.n).toBe(8);
    expect(result?.lowConfidence).toBe(true);
  });
});

describe('difficultyMismatch', () => {
  it('flags easy questions with accuracy under 40 percent', () => {
    expect(difficultyMismatch('easy', 0.39, 10)).toBe('harder_than_labeled');
    expect(difficultyMismatch('easy', 0.4, 10)).toBeNull();
  });

  it('flags hard questions with accuracy over 80 percent', () => {
    expect(difficultyMismatch('hard', 0.81, 10)).toBe('easier_than_labeled');
    expect(difficultyMismatch('hard', 0.8, 10)).toBeNull();
  });

  it('never flags medium questions or tiny samples', () => {
    expect(difficultyMismatch('medium', 0.01, 10)).toBeNull();
    expect(difficultyMismatch('easy', 0, 2)).toBeNull();
    expect(difficultyMismatch('easy', null, 0)).toBeNull();
  });
});

describe('aggregate updates', () => {
  it('updates question aggregates without mutating the previous value', () => {
    const before = emptyQuestionAggregate();
    const after = applyQuestionResponse(before, { correct: true, bucket: 3 });
    expect(before.answered).toBe(0);
    expect(after).toMatchObject({ answered: 1, correct: 1 });
    expect(after.histogram[3]).toBe(1);
  });

  it('accumulates score and regression points per participant', () => {
    let aggregate = emptyParticipantAggregate();
    aggregate = applyParticipantResponse(aggregate, {
      correct: true,
      points: 800,
      responseMs: 400,
      round: 1,
    });
    aggregate = applyParticipantResponse(aggregate, {
      correct: false,
      points: 0,
      responseMs: 600,
      round: 3,
    });
    expect(aggregate).toMatchObject({ score: 800, answered: 2, correct: 1, responseMsSum: 1000 });
    expect(aggregate.regression).toEqual({
      n: 2,
      sumX: 4,
      sumY: 1600,
      sumXY: 800 + 2400,
      sumXX: 10,
    });
  });
});

describe('medianOf', () => {
  it('handles empty, odd and even inputs', () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
  });
});
