import type { ExamPhase, SessionStatus } from '@quizup/shared';

const KEY_PREFIX = 'quizup:intro-done:';

export function shouldShowIntro(input: {
  introDone: boolean;
  mode: 'live' | 'exam';
  status: SessionStatus;
  examPhase: ExamPhase | null;
}): boolean {
  if (input.introDone) {
    return false;
  }
  if (input.mode === 'exam') {
    return input.examPhase === 'waiting' || input.examPhase === 'consent';
  }
  return input.status === 'lobby';
}

export function readIntroDone(joinCode: string): boolean {
  try {
    return window.sessionStorage.getItem(KEY_PREFIX + joinCode) === '1';
  } catch {
    return false;
  }
}

export function markIntroDone(joinCode: string): void {
  try {
    window.sessionStorage.setItem(KEY_PREFIX + joinCode, '1');
  } catch {
    return;
  }
}
