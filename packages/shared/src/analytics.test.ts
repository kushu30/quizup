import { describe, expect, it } from 'vitest';
import {
  applyParticipantResponse,
  applyQuestionResponse,
  bucketIndex,
  difficultyMismatch,
  emptyParticipantAggregate,
  emptyQuestionAggregate,
  medianOf,
} from './analytics.js';

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

  it('accumulates score and counts per participant', () => {
    let aggregate = emptyParticipantAggregate();
    aggregate = applyParticipantResponse(aggregate, {
      correct: true,
      points: 800,
      responseMs: 400,
    });
    aggregate = applyParticipantResponse(aggregate, {
      correct: false,
      points: 0,
      responseMs: 600,
    });
    expect(aggregate).toMatchObject({ score: 800, answered: 2, correct: 1, responseMsSum: 1000 });
  });
});

describe('medianOf', () => {
  it('handles empty, odd and even inputs', () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
  });
});
