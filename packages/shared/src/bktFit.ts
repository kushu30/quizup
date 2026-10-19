import { DEFAULT_BKT_PARAMS, type BktParams } from './bkt.js';
import type { RandomSource } from './sampling.js';

export const BKT_FIT_MIN_SEQUENCES = 30;
export const BKT_MAX_SLIP = 0.3;
export const BKT_MAX_GUESS = 0.3;
export const BKT_MAX_SLIP_PLUS_GUESS = 0.6;

const BOUNDS = {
  pInit: [0.01, 0.99],
  pLearn: [0.001, 0.6],
  pSlip: [0.001, BKT_MAX_SLIP],
  pGuess: [0.001, BKT_MAX_GUESS],
} as const;

const PARAM_KEYS = ['pInit', 'pLearn', 'pSlip', 'pGuess'] as const;
const START_POINTS: BktParams[] = [
  DEFAULT_BKT_PARAMS,
  { pInit: 0.5, pLearn: 0.1, pSlip: 0.1, pGuess: 0.1 },
  { pInit: 0.1, pLearn: 0.3, pSlip: 0.05, pGuess: 0.2 },
  { pInit: 0.7, pLearn: 0.05, pSlip: 0.15, pGuess: 0.15 },
  { pInit: 0.2, pLearn: 0.2, pSlip: 0.1, pGuess: 0.25 },
];
const INITIAL_STEP = 0.1;
const MIN_STEP = 1e-4;
const MAX_ITERATIONS = 400;

export type BktSequence = readonly boolean[];

export function isIdentifiable(params: BktParams): boolean {
  return (
    params.pSlip <= BKT_MAX_SLIP &&
    params.pGuess <= BKT_MAX_GUESS &&
    params.pSlip + params.pGuess < BKT_MAX_SLIP_PLUS_GUESS
  );
}

function withinBounds(params: BktParams): boolean {
  return PARAM_KEYS.every((key) => params[key] >= BOUNDS[key][0] && params[key] <= BOUNDS[key][1]);
}

export function sequenceLogLikelihood(params: BktParams, sequence: BktSequence): number {
  let known = params.pInit;
  let logLikelihood = 0;
  for (const correct of sequence) {
    const likelihoodKnown = correct ? 1 - params.pSlip : params.pSlip;
    const likelihoodUnknown = correct ? params.pGuess : 1 - params.pGuess;
    const probability = known * likelihoodKnown + (1 - known) * likelihoodUnknown;
    logLikelihood += Math.log(probability);
    const posterior = (known * likelihoodKnown) / probability;
    known = posterior + (1 - posterior) * params.pLearn;
  }
  return logLikelihood;
}

export function totalLogLikelihood(params: BktParams, sequences: readonly BktSequence[]): number {
  let total = 0;
  for (const sequence of sequences) {
    total += sequenceLogLikelihood(params, sequence);
  }
  return total;
}

export interface BktFitResult {
  params: BktParams;
  fitted: boolean;
  reason: string | null;
  sequences: number;
  observations: number;
  logLikelihoodPerObservation: number;
  defaultLogLikelihoodPerObservation: number;
}

function searchFrom(start: BktParams, sequences: readonly BktSequence[]) {
  let current = start;
  let currentLikelihood = totalLogLikelihood(current, sequences);
  let step = INITIAL_STEP;
  for (let iteration = 0; iteration < MAX_ITERATIONS && step >= MIN_STEP; iteration += 1) {
    let improved = false;
    for (const key of PARAM_KEYS) {
      for (const direction of [1, -1]) {
        const candidate = { ...current, [key]: current[key] + direction * step };
        if (!withinBounds(candidate) || !isIdentifiable(candidate)) {
          continue;
        }
        const candidateLikelihood = totalLogLikelihood(candidate, sequences);
        if (candidateLikelihood > currentLikelihood + 1e-12) {
          current = candidate;
          currentLikelihood = candidateLikelihood;
          improved = true;
        }
      }
    }
    if (!improved) {
      step /= 2;
    }
  }
  return { params: current, likelihood: currentLikelihood };
}

export function fitBkt(
  sequences: readonly BktSequence[],
  minimumSequences: number = BKT_FIT_MIN_SEQUENCES,
): BktFitResult {
  const observations = sequences.reduce((sum, sequence) => sum + sequence.length, 0);
  const defaultPerObservation =
    observations === 0 ? 0 : totalLogLikelihood(DEFAULT_BKT_PARAMS, sequences) / observations;

  if (sequences.length < minimumSequences) {
    return {
      params: DEFAULT_BKT_PARAMS,
      fitted: false,
      reason: 'insufficient data, keeping defaults',
      sequences: sequences.length,
      observations,
      logLikelihoodPerObservation: defaultPerObservation,
      defaultLogLikelihoodPerObservation: defaultPerObservation,
    };
  }

  let best = searchFrom(START_POINTS[0] as BktParams, sequences);
  for (const start of START_POINTS.slice(1)) {
    const result = searchFrom(start, sequences);
    if (result.likelihood > best.likelihood) {
      best = result;
    }
  }
  return {
    params: best.params,
    fitted: true,
    reason: null,
    sequences: sequences.length,
    observations,
    logLikelihoodPerObservation: best.likelihood / observations,
    defaultLogLikelihoodPerObservation: defaultPerObservation,
  };
}

export function generateBktSequences(
  params: BktParams,
  count: number,
  length: number,
  random: RandomSource,
): boolean[][] {
  const sequences: boolean[][] = [];
  for (let index = 0; index < count; index += 1) {
    let known = random.next() < params.pInit;
    const sequence: boolean[] = [];
    for (let step = 0; step < length; step += 1) {
      const pCorrect = known ? 1 - params.pSlip : params.pGuess;
      sequence.push(random.next() < pCorrect);
      if (!known && random.next() < params.pLearn) {
        known = true;
      }
    }
    sequences.push(sequence);
  }
  return sequences;
}
