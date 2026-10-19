import { describe, expect, it } from 'vitest';
import { quizSettingsSchema, resolveAdaptiveRounds } from './adaptive.js';

describe('quizSettingsSchema', () => {
  it('defaults adaptive to false', () => {
    expect(quizSettingsSchema.parse({})).toMatchObject({ mode: 'live', adaptive: false });
  });

  it('accepts adaptive with rounds 1 to 50', () => {
    expect(quizSettingsSchema.parse({ adaptive: true, adaptiveRounds: 7 })).toMatchObject({
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

describe('quizSettingsSchema exam mode', () => {
  it('requires a duration for an exam', () => {
    expect(quizSettingsSchema.safeParse({ mode: 'exam' }).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ mode: 'exam', durationMinutes: 0 }).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ mode: 'exam', durationMinutes: 301 }).success).toBe(
      false,
    );
    expect(quizSettingsSchema.safeParse({ mode: 'exam', durationMinutes: 45 }).success).toBe(true);
  });

  it('forces adaptive off in exam mode', () => {
    const parsed = quizSettingsSchema.parse({
      mode: 'exam',
      durationMinutes: 30,
      adaptive: true,
      adaptiveRounds: 5,
    });
    expect(parsed.adaptive).toBe(false);
    expect(parsed.adaptiveRounds).toBeUndefined();
    expect(parsed.durationMinutes).toBe(30);
  });

  it('leaves existing quizzes as live quizzes', () => {
    expect(quizSettingsSchema.parse({}).mode).toBe('live');
    expect(quizSettingsSchema.parse({ adaptive: true }).mode).toBe('live');
  });

  it('ignores a duration on a live quiz and rejects unknown modes', () => {
    expect(quizSettingsSchema.parse({ durationMinutes: 20 }).durationMinutes).toBeUndefined();
    expect(quizSettingsSchema.safeParse({ mode: 'coding' }).success).toBe(false);
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
