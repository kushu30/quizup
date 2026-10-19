import { describe, expect, it } from 'vitest';
import { DEFAULT_BKT_PARAMS, type BktParams } from './bkt.js';
import {
  BKT_FIT_MIN_SEQUENCES,
  BKT_MAX_GUESS,
  BKT_MAX_SLIP,
  BKT_MAX_SLIP_PLUS_GUESS,
  fitBkt,
  generateBktSequences,
  isIdentifiable,
  sequenceLogLikelihood,
  totalLogLikelihood,
} from './bktFit.js';
import { createSeededRandom } from './sampling.js';

const RECOVERY_TOLERANCE = 0.06;
const KEYS = ['pInit', 'pLearn', 'pSlip', 'pGuess'] as const;

describe('sequenceLogLikelihood', () => {
  it('matches a hand computation for a short sequence', () => {
    const params: BktParams = { pInit: 0.3, pLearn: 0.15, pSlip: 0.1, pGuess: 0.2 };
    const firstProbability = 0.3 * 0.9 + 0.7 * 0.2;
    const known = (0.3 * 0.9) / firstProbability;
    const afterLearn = known + (1 - known) * 0.15;
    const secondProbability = afterLearn * 0.1 + (1 - afterLearn) * 0.8;
    expect(sequenceLogLikelihood(params, [true, false])).toBeCloseTo(
      Math.log(firstProbability) + Math.log(secondProbability),
      10,
    );
  });

  it('is zero for an empty sequence and additive over sequences', () => {
    expect(sequenceLogLikelihood(DEFAULT_BKT_PARAMS, [])).toBe(0);
    const sequences = [
      [true, true],
      [false, true, false],
    ];
    expect(totalLogLikelihood(DEFAULT_BKT_PARAMS, sequences)).toBeCloseTo(
      sequenceLogLikelihood(DEFAULT_BKT_PARAMS, sequences[0] as boolean[]) +
        sequenceLogLikelihood(DEFAULT_BKT_PARAMS, sequences[1] as boolean[]),
      10,
    );
  });
});

describe('isIdentifiable', () => {
  it('enforces slip and guess at most 0.3 and a sum below 0.6', () => {
    expect(BKT_MAX_SLIP).toBe(0.3);
    expect(BKT_MAX_GUESS).toBe(0.3);
    expect(BKT_MAX_SLIP_PLUS_GUESS).toBe(0.6);
    expect(isIdentifiable({ ...DEFAULT_BKT_PARAMS, pSlip: 0.3, pGuess: 0.29 })).toBe(true);
    expect(isIdentifiable({ ...DEFAULT_BKT_PARAMS, pSlip: 0.31, pGuess: 0.1 })).toBe(false);
    expect(isIdentifiable({ ...DEFAULT_BKT_PARAMS, pSlip: 0.1, pGuess: 0.31 })).toBe(false);
    expect(isIdentifiable({ ...DEFAULT_BKT_PARAMS, pSlip: 0.3, pGuess: 0.3 })).toBe(false);
  });
});

describe('fitBkt on simulated data', () => {
  it('keeps the defaults and says so with too few sequences', () => {
    const sequences = generateBktSequences(
      DEFAULT_BKT_PARAMS,
      BKT_FIT_MIN_SEQUENCES - 1,
      8,
      createSeededRandom(1),
    );
    const result = fitBkt(sequences);
    expect(result.fitted).toBe(false);
    expect(result.reason).toBe('insufficient data, keeping defaults');
    expect(result.params).toEqual(DEFAULT_BKT_PARAMS);
  });

  it('recovers known parameters within the stated tolerance with enough data', () => {
    const truths: BktParams[] = [
      { pInit: 0.5, pLearn: 0.25, pSlip: 0.15, pGuess: 0.1 },
      { pInit: 0.15, pLearn: 0.08, pSlip: 0.05, pGuess: 0.25 },
      { pInit: 0.4, pLearn: 0.3, pSlip: 0.2, pGuess: 0.15 },
    ];
    const random = createSeededRandom(2026);
    for (const truth of truths) {
      const result = fitBkt(generateBktSequences(truth, 2000, 8, random));
      expect(result.fitted).toBe(true);
      for (const key of KEYS) {
        expect(Math.abs(result.params[key] - truth[key])).toBeLessThanOrEqual(RECOVERY_TOLERANCE);
      }
      expect(isIdentifiable(result.params)).toBe(true);
      expect(result.logLikelihoodPerObservation).toBeGreaterThanOrEqual(
        result.defaultLogLikelihoodPerObservation - 1e-9,
      );
    }
  });

  it('never returns parameters outside the identifiability bounds, even for degenerate data', () => {
    const allCorrect = Array.from({ length: 60 }, () => [true, true, true, true, true, true]);
    const allWrong = Array.from({ length: 60 }, () => [false, false, false, false, false, false]);
    for (const sequences of [allCorrect, allWrong]) {
      const result = fitBkt(sequences);
      expect(isIdentifiable(result.params)).toBe(true);
      for (const key of KEYS) {
        expect(result.params[key]).toBeGreaterThan(0);
        expect(result.params[key]).toBeLessThan(1);
      }
    }
  });

  it('is deterministic', () => {
    const sequences = generateBktSequences(DEFAULT_BKT_PARAMS, 200, 8, createSeededRandom(5));
    expect(fitBkt(sequences)).toEqual(fitBkt(sequences));
  });
});
