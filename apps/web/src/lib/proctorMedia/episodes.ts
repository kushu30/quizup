export type EpisodeSignal = 'none' | 'start' | 'continue';

interface EpisodeOptions {
  holdMs: number;
  continueMs: number;
  cooldownMs: number;
  /** An episode only ends once the condition has stayed false this long, so a detector that
   *  flickers does not split one absence into many. */
  clearMs: number;
}

export interface EpisodeTracker {
  /** Feed whether the condition holds right now; returns when a flag should be raised. */
  update(active: boolean, nowMs: number): EpisodeSignal;
}

/**
 * Turns "is the condition true right now?" samples into flags. One continuous condition is one
 * episode: it raises `start` once it has held for `holdMs`, `continue` every `continueMs` while
 * it goes on, ends after `clearMs` of the condition being false, and then the same condition is
 * ignored for `cooldownMs`.
 */
export function createEpisodeTracker(options: EpisodeOptions): EpisodeTracker {
  let activeSince: number | null = null;
  let inEpisode = false;
  let lastRaisedAt = 0;
  let clearedAt: number | null = null;
  let inactiveSince: number | null = null;

  return {
    update(active, nowMs) {
      if (!active) {
        activeSince = null;
        if (inEpisode) {
          inactiveSince ??= nowMs;
          if (nowMs - inactiveSince >= options.clearMs) {
            inEpisode = false;
            clearedAt = nowMs;
            inactiveSince = null;
          }
        }
        return 'none';
      }
      inactiveSince = null;
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
