import { ELO_MAX_RATING, ELO_MIN_RATING, INITIAL_PLAYER_RATING } from './elo.js';
import { normalizeTopicKey } from './bkt.js';

export const PROVISIONAL_QUESTION_ANSWERS = 30;

export function isProvisionalQuestion(answersCount: number): boolean {
  return answersCount < PROVISIONAL_QUESTION_ANSWERS;
}

export interface LearnerProfile {
  userId: string;
  elo: number;
  topicMastery: Record<string, number>;
  answersCount: number;
  lastSessionId: string | null;
}

export function clampProfileElo(elo: number): number {
  if (!Number.isFinite(elo)) {
    return INITIAL_PLAYER_RATING;
  }
  return Math.min(Math.max(elo, ELO_MIN_RATING), ELO_MAX_RATING);
}

export function normalizeProfileMastery(topicMastery: Record<string, number>): Map<string, number> {
  const normalized = new Map<string, number>();
  for (const [topic, value] of Object.entries(topicMastery)) {
    if (Number.isFinite(value)) {
      normalized.set(normalizeTopicKey(topic), Math.min(Math.max(value, 0), 1));
    }
  }
  return normalized;
}
