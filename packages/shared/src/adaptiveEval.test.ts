import { describe, expect, it } from 'vitest';
import {
  defaultEvalConfig,
  describeWhereAdaptiveDoesNotWin,
  runAdaptiveEvaluation,
  spearmanCorrelation,
  verdictFor,
} from './adaptiveEval.js';
import { SAMPLING_SIGMA } from './sampling.js';

const smallConfig = defaultEvalConfig({
  students: 80,
  poolSizes: [10, 30],
  bootstrapResamples: 60,
  checkpoints: [3, 5],
});

describe('spearmanCorrelation', () => {
  it('is 1 for a monotone relation, -1 for the reverse, and handles ties', () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [10, 20, 35, 80])).toBeCloseTo(1, 12);
    expect(spearmanCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
    expect(spearmanCorrelation([1, 1, 2, 3], [1, 1, 2, 3])).toBeCloseTo(1, 12);
    expect(spearmanCorrelation([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});

describe('runAdaptiveEvaluation', () => {
  it('is deterministic for a fixed seed and differs for another seed', () => {
    const first = runAdaptiveEvaluation(smallConfig);
    const second = runAdaptiveEvaluation(smallConfig);
    expect(first).toEqual(second);
    const other = runAdaptiveEvaluation({ ...smallConfig, seed: smallConfig.seed + 1 });
    expect(other.cells[0]?.rmse).not.toBe(first.cells[0]?.rmse);
  });

  it('reports one fixed arm and one adaptive arm per sigma for every pool and checkpoint', () => {
    const { cells, baselines } = runAdaptiveEvaluation(smallConfig);
    expect(cells).toHaveLength(2 * 2 * (1 + smallConfig.sigmas.length));
    expect(baselines).toHaveLength(2);
    for (const cell of cells) {
      expect(Number.isFinite(cell.rmse)).toBe(true);
      expect(cell.spearman).toBeGreaterThanOrEqual(-1);
      expect(cell.spearman).toBeLessThanOrEqual(1);
      if (cell.arm === 'fixed') {
        expect(cell.deltaRmse).toBeNull();
        expect(verdictFor(cell)).toBeNull();
      } else {
        expect(cell.deltaRmseLow as number).toBeLessThanOrEqual(cell.deltaRmseHigh as number);
        expect(cell.deltaRmse).toBeCloseTo(
          cell.rmse -
            (cells.find(
              (candidate) =>
                candidate.arm === 'fixed' &&
                candidate.poolSize === cell.poolSize &&
                candidate.answered === cell.answered,
            )?.rmse ?? Number.NaN),
          9,
        );
      }
    }
  });

  it('gives both arms the same questions when the pool is exhausted', () => {
    const { cells } = runAdaptiveEvaluation(
      defaultEvalConfig({
        students: 60,
        poolSizes: [10],
        checkpoints: [10],
        bootstrapResamples: 40,
      }),
    );
    const fixed = cells.find((cell) => cell.arm === 'fixed');
    const adaptive = cells.find((cell) => cell.arm === 'adaptive' && cell.sigma === SAMPLING_SIGMA);
    expect(Math.abs((adaptive?.rmse ?? 0) - (fixed?.rmse ?? 0))).toBeLessThan(10);
  });

  it('lists only non-winning production-sigma cells in the honesty summary', () => {
    const { cells } = runAdaptiveEvaluation(smallConfig);
    const lines = describeWhereAdaptiveDoesNotWin(cells);
    const expectedCount = cells.filter(
      (cell) =>
        cell.arm === 'adaptive' && cell.sigma === SAMPLING_SIGMA && verdictFor(cell) !== 'better',
    ).length;
    expect(lines).toHaveLength(expectedCount);
  });

  it('shows no information gain from 1000 for the baseline and a lower error with more answers', () => {
    const { cells, baselines } = runAdaptiveEvaluation(
      defaultEvalConfig({
        students: 200,
        poolSizes: [30],
        bootstrapResamples: 40,
        checkpoints: [3, 10],
      }),
    );
    const baseline = baselines[0]?.rmse ?? 0;
    const fixedThree = cells.find((cell) => cell.arm === 'fixed' && cell.answered === 3);
    const fixedTen = cells.find((cell) => cell.arm === 'fixed' && cell.answered === 10);
    expect(fixedThree?.rmse).toBeLessThan(baseline + 5);
    expect(fixedTen?.rmse).toBeLessThan(fixedThree?.rmse ?? 0);
  });
});
