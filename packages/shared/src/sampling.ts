export const SAMPLING_SIGMA = 200;
export const SAMPLING_WEIGHT_FLOOR = 0.01;

export interface RandomSource {
  next: () => number;
}

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(state ^ (state >>> 15), state | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function questionWeight(questionRating: number, playerRating: number): number {
  const distance = questionRating - playerRating;
  return Math.max(
    SAMPLING_WEIGHT_FLOOR,
    Math.exp(-(distance * distance) / (2 * SAMPLING_SIGMA * SAMPLING_SIGMA)),
  );
}

export function pickWeighted<Candidate extends { rating: number }>(
  candidates: readonly Candidate[],
  playerRating: number,
  random: RandomSource,
): Candidate | null {
  if (candidates.length === 0) {
    return null;
  }
  const weights = candidates.map((candidate) => questionWeight(candidate.rating, playerRating));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const target = random.next() * totalWeight;

  let cumulative = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    cumulative += weights[index] as number;
    if (target < cumulative) {
      return candidates[index] as Candidate;
    }
  }
  return candidates[candidates.length - 1] as Candidate;
}
