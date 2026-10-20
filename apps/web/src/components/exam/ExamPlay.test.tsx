import type { ExamStudentView } from '@quizup/shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizSocket } from '../../lib/socket';
import { ExamPlay } from './ExamPlay';

const exitFullscreen = vi.fn(async () => undefined);
let fullscreenElement: Element | null = null;

function viewIn(phase: ExamStudentView['phase']): ExamStudentView {
  return {
    phase,
    durationMinutes: 20,
    consentVersion: 'exam-consent-2026-10-v1',
    attempt: null,
    questions: [],
    answers: {},
    resultsReleased: false,
  };
}

function renderPhase(phase: ExamStudentView['phase']) {
  const socket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as unknown as QuizSocket;
  return render(
    <ExamPlay
      socket={socket}
      view={viewIn(phase)}
      displayName="Ada"
      offsetMs={0}
      connected
      onViewChange={() => undefined}
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
});

afterEach(() => {
  cleanup();
  exitFullscreen.mockClear();
  fullscreenElement = null;
});

describe('ExamPlay full screen', () => {
  it('leaves full screen once the exam is submitted', () => {
    fullscreenElement = document.documentElement;
    renderPhase('submitted');
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('leaves full screen when the exam closes', () => {
    fullscreenElement = document.documentElement;
    renderPhase('closed');
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the page is not in full screen', () => {
    renderPhase('submitted');
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it('stays in full screen before the exam ends', () => {
    fullscreenElement = document.documentElement;
    renderPhase('consent');
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});
