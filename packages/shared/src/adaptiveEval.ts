import { INITIAL_PLAYER_RATING, initialQuestionRating, updateRatings } from './elo.js';
import type { Difficulty } from './enums.js';
import {
  SAMPLING_SIGMA,
  createSeededRandom,
  selectNextAdaptiveQuestion,
  type RandomSource,
} from './sampling.js';

export const STUDENT_MODEL_SCALE = 400 / Math.LN10;
export const EVAL_ABILITY_MEAN = 1000;
export const EVAL_ABILITY_SD = 200;
export const EVAL_DIFFICULTY_NOISE_SD = 60;
export const EVAL_QUESTION_DURATION_MS = 20_000;
export const EVAL_DEFAULT_SEED = 424242;
export const EVAL_DEFAULT_STUDENTS = 500;
export const EVAL_DEFAULT_POOL_SIZES = [10, 30, 100];
export const EVAL_DEFAULT_SIGMAS = [100, 200, 400];
export const EVAL_DEFAULT_CHECKPOINTS = [3, 5, 8, 10];
export const EVAL_DEFAULT_BOOTSTRAP = 1000;

const DIFFICULTY_CYCLE: Difficulty[] = ['easy', 'medium', 'hard'];

export interface EvalConfig {
  poolSizes: number[];
  sigmas: number[];
  checkpoints: number[];
  students: number;
  seed: number;
  bootstrapResamples: number;
  scale: number;
}

export function defaultEvalConfig(overrides: Partial<EvalConfig> = {}): EvalConfig {
  return {
    poolSizes: EVAL_DEFAULT_POOL_SIZES,
    sigmas: EVAL_DEFAULT_SIGMAS,
    checkpoints: EVAL_DEFAULT_CHECKPOINTS,
    students: EVAL_DEFAULT_STUDENTS,
    seed: EVAL_DEFAULT_SEED,
    bootstrapResamples: EVAL_DEFAULT_BOOTSTRAP,
    scale: STUDENT_MODEL_SCALE,
    ...overrides,
  };
}

export interface EvalCell {
  poolSize: number;
  arm: 'fixed' | 'adaptive';
  sigma: number | null;
  answered: number;
  rmse: number;
  spearman: number;
  deltaRmse: number | null;
  deltaRmseLow: number | null;
  deltaRmseHigh: number | null;
  deltaSpearman: number | null;
}

export type EvalVerdict = 'better' | 'no significant difference' | 'worse';

export function verdictFor(cell: EvalCell): EvalVerdict | null {
  if (cell.deltaRmseLow === null || cell.deltaRmseHigh === null) {
    return null;
  }
  if (cell.deltaRmseHigh < 0) {
    return 'better';
  }
  if (cell.deltaRmseLow > 0) {
    return 'worse';
  }
  return 'no significant difference';
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function gaussian(random: RandomSource): number {
  const first = Math.max(random.next(), 1e-12);
  const second = random.next();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function shuffled<Item>(items: readonly Item[], random: RandomSource): Item[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random.next() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as Item, copy[index] as Item];
  }
  return copy;
}

function ranksWithTies(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let position = 0;
  while (position < order.length) {
    let end = position;
    while (
      end + 1 < order.length &&
      (order[end + 1] as { value: number }).value === (order[position] as { value: number }).value
    ) {
      end += 1;
    }
    const averageRank = (position + end) / 2 + 1;
    for (let tied = position; tied <= end; tied += 1) {
      ranks[(order[tied] as { index: number }).index] = averageRank;
    }
    position = end + 1;
  }
  return ranks;
}

export function spearmanCorrelation(first: readonly number[], second: readonly number[]): number {
  const rankFirst = ranksWithTies(first);
  const rankSecond = ranksWithTies(second);
  const count = first.length;
  const meanFirst = rankFirst.reduce((sum, value) => sum + value, 0) / count;
  const meanSecond = rankSecond.reduce((sum, value) => sum + value, 0) / count;
  let covariance = 0;
  let varianceFirst = 0;
  let varianceSecond = 0;
  for (let index = 0; index < count; index += 1) {
    const deltaFirst = (rankFirst[index] as number) - meanFirst;
    const deltaSecond = (rankSecond[index] as number) - meanSecond;
    covariance += deltaFirst * deltaSecond;
    varianceFirst += deltaFirst * deltaFirst;
    varianceSecond += deltaSecond * deltaSecond;
  }
  const denominator = Math.sqrt(varianceFirst * varianceSecond);
  return denominator === 0 ? 0 : covariance / denominator;
}

interface PoolQuestion {
  id: string;
  rating: number;
  trueDifficulty: number;
}

interface SimulatedStudent {
  ability: number;
  uniforms: number[];
  speeds: number[];
  orderSeed: number;
  selectionSeed: number;
}

type ArmSpec = { arm: 'fixed'; sigma: null } | { arm: 'adaptive'; sigma: number };

function buildPool(size: number, random: RandomSource): PoolQuestion[] {
  return Array.from({ length: size }, (_, index) => {
    const label = DIFFICULTY_CYCLE[index % DIFFICULTY_CYCLE.length] as Difficulty;
    const rating = initialQuestionRating(label);
    return {
      id: String(index),
      rating,
      trueDifficulty: rating + EVAL_DIFFICULTY_NOISE_SD * gaussian(random),
    };
  });
}

function buildStudents(count: number, poolSize: number, random: RandomSource): SimulatedStudent[] {
  return Array.from({ length: count }, () => ({
    ability: EVAL_ABILITY_MEAN + EVAL_ABILITY_SD * gaussian(random),
    uniforms: Array.from({ length: poolSize }, () => random.next()),
    speeds: Array.from({ length: poolSize }, () => 0.1 + 0.8 * random.next()),
    orderSeed: Math.floor(random.next() * 2 ** 31),
    selectionSeed: Math.floor(random.next() * 2 ** 31),
  }));
}

function estimateAfterEachAnswer(
  student: SimulatedStudent,
  pool: readonly PoolQuestion[],
  arm: ArmSpec,
  maxAnswers: number,
  scale: number,
): number[] {
  const served = new Set<string>();
  const fixedOrder =
    arm.arm === 'fixed' ? shuffled(pool, createSeededRandom(student.orderSeed)) : [];
  const selectionRandom = createSeededRandom(student.selectionSeed);
  let elo = INITIAL_PLAYER_RATING;
  const estimates: number[] = [];

  for (let step = 0; step < maxAnswers; step += 1) {
    const question =
      arm.arm === 'fixed'
        ? (fixedOrder[step] ?? null)
        : selectNextAdaptiveQuestion(pool, served, elo, selectionRandom, arm.sigma);
    if (!question) {
      break;
    }
    served.add(question.id);
    const index = Number(question.id);
    const correct =
      (student.uniforms[index] as number) <
      sigmoid((student.ability - question.trueDifficulty) / scale);
    elo = updateRatings({
      playerRating: elo,
      questionRating: question.rating,
      correct,
      responseMs: (student.speeds[index] as number) * EVAL_QUESTION_DURATION_MS,
      durationMs: EVAL_QUESTION_DURATION_MS,
    }).playerRating;
    estimates.push(elo);
  }
  return estimates;
}

function rmseOf(squaredErrors: readonly number[]): number {
  return Math.sqrt(squaredErrors.reduce((sum, value) => sum + value, 0) / squaredErrors.length);
}

function bootstrapDifference(
  adaptiveSquared: readonly number[],
  fixedSquared: readonly number[],
  resamples: number,
  random: RandomSource,
): { low: number; high: number } {
  const count = adaptiveSquared.length;
  const differences: number[] = [];
  for (let resample = 0; resample < resamples; resample += 1) {
    let adaptiveSum = 0;
    let fixedSum = 0;
    for (let draw = 0; draw < count; draw += 1) {
      const index = Math.floor(random.next() * count);
      adaptiveSum += adaptiveSquared[index] as number;
      fixedSum += fixedSquared[index] as number;
    }
    differences.push(Math.sqrt(adaptiveSum / count) - Math.sqrt(fixedSum / count));
  }
  differences.sort((first, second) => first - second);
  return {
    low: differences[Math.floor(0.025 * (differences.length - 1))] as number,
    high: differences[Math.ceil(0.975 * (differences.length - 1))] as number,
  };
}

export interface EvalBaseline {
  poolSize: number;
  rmse: number;
}

export interface EvalReport {
  cells: EvalCell[];
  baselines: EvalBaseline[];
}

export function runAdaptiveEvaluation(config: EvalConfig): EvalReport {
  const maxAnswers = Math.max(...config.checkpoints);
  const cells: EvalCell[] = [];
  const baselines: EvalBaseline[] = [];

  for (const poolSize of config.poolSizes) {
    const setupRandom = createSeededRandom(config.seed + poolSize);
    const pool = buildPool(poolSize, setupRandom);
    const students = buildStudents(config.students, poolSize, setupRandom);
    const abilities = students.map((student) => student.ability);
    baselines.push({
      poolSize,
      rmse: rmseOf(abilities.map((ability) => (ability - INITIAL_PLAYER_RATING) ** 2)),
    });

    const arms: ArmSpec[] = [
      { arm: 'fixed', sigma: null },
      ...config.sigmas.map((sigma): ArmSpec => ({ arm: 'adaptive', sigma })),
    ];

    const estimatesByArm = arms.map((arm) =>
      students.map((student) =>
        estimateAfterEachAnswer(student, pool, arm, Math.min(maxAnswers, poolSize), config.scale),
      ),
    );
    const squaredByArm = (armIndex: number, answered: number) =>
      (estimatesByArm[armIndex] as number[][]).map((estimates, studentIndex) => {
        const estimate = estimates[answered - 1] as number;
        return (estimate - (abilities[studentIndex] as number)) ** 2;
      });
    const estimatesAt = (armIndex: number, answered: number) =>
      (estimatesByArm[armIndex] as number[][]).map(
        (estimates) => estimates[answered - 1] as number,
      );

    for (const answered of config.checkpoints) {
      if (answered > poolSize) {
        continue;
      }
      const fixedSquared = squaredByArm(0, answered);
      const fixedRmse = rmseOf(fixedSquared);
      const fixedSpearman = spearmanCorrelation(estimatesAt(0, answered), abilities);

      arms.forEach((arm, armIndex) => {
        const squared = armIndex === 0 ? fixedSquared : squaredByArm(armIndex, answered);
        const rmse = armIndex === 0 ? fixedRmse : rmseOf(squared);
        const spearman =
          armIndex === 0
            ? fixedSpearman
            : spearmanCorrelation(estimatesAt(armIndex, answered), abilities);
        if (arm.arm === 'fixed') {
          cells.push({
            poolSize,
            arm: 'fixed',
            sigma: null,
            answered,
            rmse,
            spearman,
            deltaRmse: null,
            deltaRmseLow: null,
            deltaRmseHigh: null,
            deltaSpearman: null,
          });
          return;
        }
        const interval = bootstrapDifference(
          squared,
          fixedSquared,
          config.bootstrapResamples,
          createSeededRandom(config.seed * 31 + poolSize * 7 + answered * 3 + arm.sigma),
        );
        cells.push({
          poolSize,
          arm: 'adaptive',
          sigma: arm.sigma,
          answered,
          rmse,
          spearman,
          deltaRmse: rmse - fixedRmse,
          deltaRmseLow: interval.low,
          deltaRmseHigh: interval.high,
          deltaSpearman: spearman - fixedSpearman,
        });
      });
    }
  }
  return { cells, baselines };
}

export function describeWhereAdaptiveDoesNotWin(
  cells: readonly EvalCell[],
  focusSigma: number = SAMPLING_SIGMA,
): string[] {
  const lines: string[] = [];
  for (const cell of cells) {
    if (cell.arm !== 'adaptive' || cell.sigma !== focusSigma) {
      continue;
    }
    const verdict = verdictFor(cell);
    if (verdict && verdict !== 'better') {
      lines.push(
        `pool ${cell.poolSize}, k=${cell.answered}: ${verdict} (RMSE diff ${cell.deltaRmse?.toFixed(1)}, 95% CI ${cell.deltaRmseLow?.toFixed(1)} to ${cell.deltaRmseHigh?.toFixed(1)})`,
      );
    }
  }
  return lines;
}
