import { describe, expect, it } from 'vitest';
import { createLoudnessDetector, rmsLevel } from './audioLevel';

describe('rmsLevel', () => {
  it('is zero for silence and for no samples', () => {
    expect(rmsLevel(new Float32Array(256))).toBe(0);
    expect(rmsLevel(new Float32Array(0))).toBe(0);
  });

  it('is about 0.707 for a full-scale sine wave', () => {
    const samples = new Float32Array(1024).map((_, index) =>
      Math.sin((index / 1024) * Math.PI * 2 * 8),
    );
    expect(rmsLevel(samples)).toBeCloseTo(0.707, 2);
  });
});

describe('createLoudnessDetector', () => {
  function calibrate(level: number) {
    const detector = createLoudnessDetector();
    for (let at = 0; at < 5000; at += 250) {
      detector.push(level, at);
    }
    return detector;
  }

  it('never reports loud while it is still learning the room', () => {
    const detector = createLoudnessDetector();
    for (let at = 0; at < 4750; at += 250) {
      expect(detector.push(0.9, at)).toBe(false);
    }
  });

  it('ignores a quiet room and everyday sounds below the floor', () => {
    const detector = calibrate(0.01);
    expect(detector.push(0.03, 5000)).toBe(false);
    expect(detector.push(0.07, 5250)).toBe(false);
  });

  it('reports sound clearly above the quiet baseline', () => {
    const detector = calibrate(0.01);
    expect(detector.push(0.2, 5000)).toBe(true);
  });

  it('raises the bar in a noisy room', () => {
    const detector = calibrate(0.1);
    expect(detector.push(0.15, 5000)).toBe(false);
    expect(detector.push(0.3, 5250)).toBe(true);
  });
});
