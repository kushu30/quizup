import { describe, expect, it } from 'vitest';
import { quizSettingsSchema } from './adaptive.js';
import { assessmentTypeOf, settingsForAssessmentType } from './assessmentType.js';

describe('assessment type', () => {
  it('reads the type from stored settings', () => {
    expect(assessmentTypeOf(quizSettingsSchema.parse({}))).toBe('live');
    expect(assessmentTypeOf(quizSettingsSchema.parse({ adaptive: true }))).toBe('adaptive');
    expect(assessmentTypeOf(quizSettingsSchema.parse({ mode: 'exam', durationMinutes: 30 }))).toBe(
      'exam',
    );
  });

  it('builds settings that parse back to the same type', () => {
    for (const type of ['live', 'adaptive', 'exam'] as const) {
      const settings = quizSettingsSchema.parse(settingsForAssessmentType(type, 45));
      expect(assessmentTypeOf(settings)).toBe(type);
    }
  });

  it('keeps the exam length only for timed exams', () => {
    expect(quizSettingsSchema.parse(settingsForAssessmentType('exam', 45)).durationMinutes).toBe(
      45,
    );
    expect(
      quizSettingsSchema.parse(settingsForAssessmentType('live', 45)).durationMinutes,
    ).toBeUndefined();
  });

  it('lets adaptive quizzes choose the number of rounds automatically', () => {
    expect(
      quizSettingsSchema.parse(settingsForAssessmentType('adaptive')).adaptiveRounds,
    ).toBeUndefined();
  });
});
