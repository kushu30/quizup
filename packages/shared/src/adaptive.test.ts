import { describe, expect, it } from 'vitest';
import { quizSettingsSchema, resolveAdaptiveRounds } from './adaptive.js';

describe('quizSettingsSchema', () => {
  it('defaults adaptive to false', () => {
    expect(quizSettingsSchema.parse({})).toEqual({ adaptive: false });
  });

  it('accepts adaptive with rounds 1 to 50', () => {
    expect(quizSettingsSchema.parse({ adaptive: true, adaptiveRounds: 7 })).toEqual({
      adaptive: true,
      adaptiveRounds: 7,
    });
    expect(quizSettingsSchema.safeParse({ adaptive: true, adaptiveRounds: 0 }).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ adaptive: true, adaptiveRounds: 51 }).success).toBe(
      false,
    );
    expect(quizSettingsSchema.safeParse({ adaptive: true, adaptiveRounds: 2.5 }).success).toBe(
      false,
    );
    expect(quizSettingsSchema.safeParse({ adaptive: 'yes' }).success).toBe(false);
  });
});

describe('resolveAdaptiveRounds', () => {
  it('defaults to min(10, approved count)', () => {
    expect(resolveAdaptiveRounds(undefined, 30)).toBe(10);
    expect(resolveAdaptiveRounds(undefined, 6)).toBe(6);
  });

  it('never exceeds the approved count', () => {
    expect(resolveAdaptiveRounds(25, 12)).toBe(12);
    expect(resolveAdaptiveRounds(5, 12)).toBe(5);
  });
});
