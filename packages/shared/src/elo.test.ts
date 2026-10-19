import { describe, expect, it } from 'vitest';
import {
  ELO_MAX_RATING,
  ELO_MIN_RATING,
  expectedScore,
  initialQuestionRating,
  updateRatings,
} from './elo.js';

const durationMs = 20_000;
const TOLERANCE = 3;

describe('expectedScore', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 6);
  });

  it('matches the logistic formula', () => {
    expect(expectedScore(1000, 1200)).toBeCloseTo(0.240253, 5);
    expect(expectedScore(1000, 800)).toBeCloseTo(0.759747, 5);
  });
});

describe('initialQuestionRating', () => {
  it('maps difficulty to a starting rating', () => {
    expect(initialQuestionRating('easy')).toBe(800);
    expect(initialQuestionRating('medium')).toBe(1000);
    expect(initialQuestionRating('hard')).toBe(1200);
  });
});

describe('updateRatings with K = 32', () => {
  it('equal ratings, instant correct answer', () => {
    const result = updateRatings({
      playerRating: 1000,
      questionRating: 1000,
      correct: true,
      responseMs: 0,
      durationMs,
    });
    expect(result.playerRating).toBeCloseTo(1016, TOLERANCE);
    expect(result.questionRating).toBeCloseTo(984, TOLERANCE);
    expect(result.score).toBeCloseTo(1, 6);
  });

  it('equal ratings, correct answer at the deadline scores 0.9', () => {
    const result = updateRatings({
      playerRating: 1000,
      questionRating: 1000,
      correct: true,
      responseMs: durationMs,
      durationMs,
    });
    expect(result.playerRating).toBeCloseTo(1012.8, TOLERANCE);
    expect(result.questionRating).toBeCloseTo(987.2, TOLERANCE);
    expect(result.score).toBeCloseTo(0.9, 6);
  });

  it('upset: correct on a harder question', () => {
    const result = updateRatings({
      playerRating: 1000,
      questionRating: 1200,
      correct: true,
      responseMs: 0,
      durationMs,
    });
    expect(result.expected).toBeCloseTo(0.240253, 5);
    expect(result.playerRating).toBeCloseTo(1024.312, TOLERANCE);
    expect(result.questionRating).toBeCloseTo(1175.688, TOLERANCE);
  });

  it('wrong on an easier question', () => {
    const result = updateRatings({
      playerRating: 1000,
      questionRating: 800,
      correct: false,
      responseMs: 5000,
      durationMs,
    });
    expect(result.expected).toBeCloseTo(0.759747, 5);
    expect(result.playerRating).toBeCloseTo(975.688, TOLERANCE);
    expect(result.questionRating).toBeCloseTo(824.312, TOLERANCE);
    expect(result.score).toBe(0);
  });

  it('wrong at equal ratings', () => {
    const result = updateRatings({
      playerRating: 1000,
      questionRating: 1000,
      correct: false,
      responseMs: 0,
      durationMs,
    });
    expect(result.playerRating).toBeCloseTo(984, TOLERANCE);
    expect(result.questionRating).toBeCloseTo(1016, TOLERANCE);
  });

  it('is zero-sum away from the bounds', () => {
    const cases = [
      { playerRating: 1000, questionRating: 1200, correct: true, responseMs: 3000 },
      { playerRating: 1450, questionRating: 900, correct: false, responseMs: 12_000 },
      { playerRating: 620, questionRating: 1130, correct: true, responseMs: 19_000 },
    ];
    for (const input of cases) {
      const result = updateRatings({ ...input, durationMs });
      expect(
        result.playerRating + result.questionRating - (input.playerRating + input.questionRating),
      ).toBeCloseTo(0, 9);
    }
  });

  it('clamps ratings at the bounds', () => {
    const lowered = updateRatings({
      playerRating: ELO_MIN_RATING,
      questionRating: ELO_MIN_RATING,
      correct: false,
      responseMs: 0,
      durationMs,
    });
    expect(lowered.playerRating).toBe(ELO_MIN_RATING);
    expect(lowered.questionRating).toBeGreaterThan(ELO_MIN_RATING);

    const raised = updateRatings({
      playerRating: ELO_MAX_RATING,
      questionRating: ELO_MAX_RATING,
      correct: true,
      responseMs: 0,
      durationMs,
    });
    expect(raised.playerRating).toBe(ELO_MAX_RATING);
    expect(raised.questionRating).toBeLessThan(ELO_MAX_RATING);

    const questionFloor = updateRatings({
      playerRating: 2000,
      questionRating: ELO_MIN_RATING,
      correct: true,
      responseMs: 0,
      durationMs,
    });
    expect(questionFloor.questionRating).toBe(ELO_MIN_RATING);
  });

  it('treats response times beyond the duration as no speed bonus', () => {
    const result = updateRatings({
      playerRating: 1000,
      questionRating: 1000,
      correct: true,
      responseMs: durationMs * 3,
      durationMs,
    });
    expect(result.score).toBeCloseTo(0.9, 6);
  });
});
