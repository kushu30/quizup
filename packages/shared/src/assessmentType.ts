import {
  DEFAULT_EXAM_DURATION_MINUTES,
  type QuizSettings,
  type QuizSettingsInput,
} from './adaptive.js';

export const ASSESSMENT_TYPES = ['live', 'adaptive', 'exam'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export function assessmentTypeOf(settings: QuizSettings): AssessmentType {
  if (settings.mode === 'exam') {
    return 'exam';
  }
  return settings.adaptive ? 'adaptive' : 'live';
}

export function settingsForAssessmentType(
  type: AssessmentType,
  durationMinutes: number = DEFAULT_EXAM_DURATION_MINUTES,
): QuizSettingsInput {
  if (type === 'exam') {
    return { mode: 'exam', durationMinutes, adaptive: false };
  }
  return { mode: 'live', adaptive: type === 'adaptive' };
}
