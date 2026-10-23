import { AUDIO_CALIBRATION_MS, AUDIO_FLOOR, AUDIO_MARGIN } from './thresholds';

export function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

export interface LoudnessDetector {
  /** Feeds one level reading; returns whether the sound is loud for this room right now. */
  push(level: number, nowMs: number): boolean;
}

/** Learns the room's quiet level for the first few seconds, then reports sound well above it. */
export function createLoudnessDetector(): LoudnessDetector {
  let startedAt: number | null = null;
  let total = 0;
  let count = 0;
  let threshold: number | null = null;

  return {
    push(level, nowMs) {
      startedAt ??= nowMs;
      if (threshold === null) {
        if (nowMs - startedAt < AUDIO_CALIBRATION_MS) {
          total += level;
          count += 1;
          return false;
        }
        const baseline = count > 0 ? total / count : 0;
        threshold = Math.max(baseline + AUDIO_MARGIN, AUDIO_FLOOR);
      }
      return level > threshold;
    },
  };
}
