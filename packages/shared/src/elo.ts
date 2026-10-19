import type { Difficulty } from './enums.js';

export const ELO_K_FACTOR = 32;
export const ELO_MIN_RATING = 100;
export const ELO_MAX_RATING = 3000;
export const ELO_SCALE = 400;
export const CORRECT_BASE_SCORE = 0.9;
export const CORRECT_SPEED_RANGE = 0.1;
export const INITIAL_PLAYER_RATING = 1000;

const INITIAL_QUESTION_RATINGS: Record<Difficulty, number> = {
  easy: 800,
  medium: 1000,
  hard: 1200,
};

export function initialQuestionRating(difficulty: Difficulty): number {
  return INITIAL_QUESTION_RATINGS[difficulty];
}

export function clampRating(rating: number): number {
  return Math.min(Math.max(rating, ELO_MIN_RATING), ELO_MAX_RATING);
}

export function expectedScore(playerRating: number, questionRating: number): number {
  return 1 / (1 + 10 ** ((questionRating - playerRating) / ELO_SCALE));
}

export interface RatingUpdateInput {
  playerRating: number;
  questionRating: number;
  correct: boolean;
  responseMs: number;
  durationMs: number;
}

export interface RatingUpdateResult {
  playerRating: number;
  questionRating: number;
  expected: number;
  score: number;
}

export function speedFactor(responseMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }
  return Math.min(Math.max(1 - responseMs / durationMs, 0), 1);
}

export function updateRatings(input: RatingUpdateInput): RatingUpdateResult {
  const expected = expectedScore(input.playerRating, input.questionRating);
  const score = input.correct
    ? CORRECT_BASE_SCORE + CORRECT_SPEED_RANGE * speedFactor(input.responseMs, input.durationMs)
    : 0;
  return {
    playerRating: clampRating(input.playerRating + ELO_K_FACTOR * (score - expected)),
    questionRating: clampRating(input.questionRating + ELO_K_FACTOR * (expected - score)),
    expected,
    score,
  };
}
