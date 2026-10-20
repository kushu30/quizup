import { afterEach, describe, expect, it } from 'vitest';
import { markIntroDone, readIntroDone, shouldShowIntro } from './introGate';

afterEach(() => {
  sessionStorage.clear();
});

describe('intro gate', () => {
  it('shows the intro before a live quiz starts', () => {
    expect(
      shouldShowIntro({ introDone: false, mode: 'live', status: 'lobby', examPhase: null }),
    ).toBe(true);
  });

  it('skips the intro when a student rejoins a quiz already running or ended', () => {
    expect(
      shouldShowIntro({ introDone: false, mode: 'live', status: 'running', examPhase: null }),
    ).toBe(false);
    expect(
      shouldShowIntro({ introDone: false, mode: 'live', status: 'ended', examPhase: null }),
    ).toBe(false);
  });

  it('shows the intro for an exam while waiting or before consent, never mid-attempt', () => {
    expect(
      shouldShowIntro({ introDone: false, mode: 'exam', status: 'lobby', examPhase: 'waiting' }),
    ).toBe(true);
    expect(
      shouldShowIntro({ introDone: false, mode: 'exam', status: 'running', examPhase: 'consent' }),
    ).toBe(true);
    expect(
      shouldShowIntro({
        introDone: false,
        mode: 'exam',
        status: 'running',
        examPhase: 'in_progress',
      }),
    ).toBe(false);
    expect(
      shouldShowIntro({ introDone: false, mode: 'exam', status: 'ended', examPhase: 'submitted' }),
    ).toBe(false);
  });

  it('never shows the intro twice', () => {
    expect(
      shouldShowIntro({ introDone: true, mode: 'live', status: 'lobby', examPhase: null }),
    ).toBe(false);
  });

  it('remembers that the intro was finished for this join code only', () => {
    expect(readIntroDone('K7M2QX')).toBe(false);
    markIntroDone('K7M2QX');
    expect(readIntroDone('K7M2QX')).toBe(true);
    expect(readIntroDone('ZZ9ZZ9')).toBe(false);
  });
});
