export const QUESTION_START_DELAY_MS = 3000;
export const ANSWER_GRACE_MS = 300;
export const LEADERBOARD_SIZE = 10;
export const BASE_CORRECT_POINTS = 500;
export const MAX_SPEED_BONUS_POINTS = 500;

export function clampResponseMs(responseMs: number, durationMs: number): number {
  return Math.min(Math.max(responseMs, 0), durationMs);
}

export function computePoints(input: {
  correct: boolean;
  responseMs: number;
  durationMs: number;
}): number {
  if (!input.correct) {
    return 0;
  }
  const responseMs = clampResponseMs(input.responseMs, input.durationMs);
  return (
    BASE_CORRECT_POINTS + Math.round(MAX_SPEED_BONUS_POINTS * (1 - responseMs / input.durationMs))
  );
}

export type AnswerWindowStatus = 'ok' | 'too_early' | 'too_late';

export function getAnswerWindowStatus(input: {
  receivedAtMs: number;
  startsAtServerMs: number;
  durationMs: number;
  graceMs?: number;
}): AnswerWindowStatus {
  const graceMs = input.graceMs ?? ANSWER_GRACE_MS;
  if (input.receivedAtMs < input.startsAtServerMs) {
    return 'too_early';
  }
  if (input.receivedAtMs > input.startsAtServerMs + input.durationMs + graceMs) {
    return 'too_late';
  }
  return 'ok';
}
