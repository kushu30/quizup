import type { SessionStatus } from '@quizup/shared';

const KEY_PREFIX = 'quizup:precheck-done:';

/** Whether the camera and microphone check should still be shown before the session. */
export function shouldShowPrecheck(input: {
  precheckDone: boolean;
  proctored: boolean;
  camera: boolean;
  mic: boolean;
  status: SessionStatus;
}): boolean {
  return (
    !input.precheckDone &&
    input.proctored &&
    (input.camera || input.mic) &&
    input.status !== 'ended'
  );
}

export function readPrecheckDone(joinCode: string): boolean {
  try {
    return window.sessionStorage.getItem(KEY_PREFIX + joinCode) === '1';
  } catch {
    return false;
  }
}

export function markPrecheckDone(joinCode: string): void {
  try {
    window.sessionStorage.setItem(KEY_PREFIX + joinCode, '1');
  } catch {
    return;
  }
}
