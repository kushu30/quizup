import { describe, expect, it } from 'vitest';
import { createEpisodeTracker } from './episodes';

const OPTIONS = { holdMs: 3000, continueMs: 30_000, cooldownMs: 5000 };

describe('createEpisodeTracker', () => {
  it('stays quiet until the condition has held for the full hold time', () => {
    const tracker = createEpisodeTracker(OPTIONS);
    expect(tracker.update(true, 0)).toBe('none');
    expect(tracker.update(true, 1000)).toBe('none');
    expect(tracker.update(true, 2900)).toBe('none');
    expect(tracker.update(true, 3000)).toBe('start');
  });

  it('counts a long episode again every continue interval, not every second', () => {
    const tracker = createEpisodeTracker(OPTIONS);
    tracker.update(true, 0);
    expect(tracker.update(true, 3000)).toBe('start');
    for (let at = 4000; at < 33_000; at += 1000) {
      expect(tracker.update(true, at)).toBe('none');
    }
    expect(tracker.update(true, 33_000)).toBe('continue');
    expect(tracker.update(true, 34_000)).toBe('none');
    expect(tracker.update(true, 63_000)).toBe('continue');
  });

  it('needs the condition to clear, a cooldown, and a fresh hold before the next episode', () => {
    const tracker = createEpisodeTracker(OPTIONS);
    tracker.update(true, 0);
    expect(tracker.update(true, 3000)).toBe('start');
    expect(tracker.update(false, 4000)).toBe('none');
    for (let at = 5000; at < 12_000; at += 1000) {
      expect(tracker.update(true, at)).toBe('none');
    }
    expect(tracker.update(true, 12_000)).toBe('start');
  });

  it('never starts when the condition flaps around the threshold', () => {
    const tracker = createEpisodeTracker(OPTIONS);
    const results = new Set<string>();
    for (let at = 0; at < 120_000; at += 1000) {
      results.add(tracker.update(Math.floor(at / 1000) % 2 === 0, at));
    }
    expect([...results]).toEqual(['none']);
  });

  it('forgets a short blip completely', () => {
    const tracker = createEpisodeTracker(OPTIONS);
    tracker.update(true, 0);
    tracker.update(true, 2000);
    tracker.update(false, 2500);
    expect(tracker.update(true, 3000)).toBe('none');
    expect(tracker.update(true, 5900)).toBe('none');
    expect(tracker.update(true, 6000)).toBe('start');
  });

  it('keeps separate state per tracker', () => {
    const first = createEpisodeTracker(OPTIONS);
    const second = createEpisodeTracker(OPTIONS);
    first.update(true, 0);
    expect(first.update(true, 3000)).toBe('start');
    expect(second.update(true, 3000)).toBe('none');
  });
});
