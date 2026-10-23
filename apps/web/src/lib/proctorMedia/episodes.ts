export type EpisodeSignal = 'none' | 'start' | 'continue';

interface EpisodeOptions {
  holdMs: number;
  continueMs: number;
  cooldownMs: number;
}

export interface EpisodeTracker {
  /** Feed whether the condition holds right now; returns when a flag should be raised. */
  update(active: boolean, nowMs: number): EpisodeSignal;
}

/**
 * Turns "is the condition true right now?" samples into flags. One continuous condition is one
 * episode: it raises `start` once it has held for `holdMs`, `continue` every `continueMs` while
 * it goes on, and after it clears the same condition is ignored for `cooldownMs`.
 */
export function createEpisodeTracker(options: EpisodeOptions): EpisodeTracker {
  let activeSince: number | null = null;
  let inEpisode = false;
  let lastRaisedAt = 0;
  let clearedAt: number | null = null;

  return {
    update(active, nowMs) {
      if (!active) {
        if (inEpisode) {
          inEpisode = false;
          clearedAt = nowMs;
        }
        activeSince = null;
        return 'none';
      }
      if (inEpisode) {
        if (nowMs - lastRaisedAt >= options.continueMs) {
          lastRaisedAt = nowMs;
          return 'continue';
        }
        return 'none';
      }
      if (clearedAt !== null && nowMs - clearedAt < options.cooldownMs) {
        activeSince = null;
        return 'none';
      }
      activeSince ??= nowMs;
      if (nowMs - activeSince >= options.holdMs) {
        inEpisode = true;
        lastRaisedAt = nowMs;
        return 'start';
      }
      return 'none';
    },
  };
}
