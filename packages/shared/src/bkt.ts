export interface BktParams {
  pInit: number;
  pLearn: number;
  pSlip: number;
  pGuess: number;
}

export const DEFAULT_BKT_PARAMS: BktParams = {
  pInit: 0.3,
  pLearn: 0.15,
  pSlip: 0.1,
  pGuess: 0.2,
};

export function normalizeTopicKey(topic: string): string {
  return topic.trim().toLowerCase();
}

export function bktUpdate(
  pMastery: number,
  correct: boolean,
  params: BktParams = DEFAULT_BKT_PARAMS,
): number {
  const mastered = pMastery;
  const unmastered = 1 - pMastery;
  const posterior = correct
    ? (mastered * (1 - params.pSlip)) / (mastered * (1 - params.pSlip) + unmastered * params.pGuess)
    : (mastered * params.pSlip) / (mastered * params.pSlip + unmastered * (1 - params.pGuess));
  const next = posterior + (1 - posterior) * params.pLearn;
  return Math.min(Math.max(next, 0), 1);
}
