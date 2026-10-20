import type { ExamStudentView } from '@quizup/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizSocket } from '../../lib/socket';
import { ExamAttemptView } from './ExamAttemptView';

type Ack = (response: unknown) => void;

function makeSocket() {
  const emit = vi.fn<(event: string, payload: unknown, ack?: Ack) => void>();
  return { socket: { emit } as unknown as QuizSocket, emit };
}

function emitted(emit: ReturnType<typeof makeSocket>['emit'], event: string) {
  return emit.mock.calls.filter(([name]) => name === event);
}

const NOW = 1_800_000_000_000;

const view: ExamStudentView = {
  phase: 'in_progress',
  durationMinutes: 20,
  consentVersion: 'exam-consent-2026-10-v1',
  attempt: {
    attemptId: '11111111-1111-4111-8111-111111111111',
    startedAtServerMs: NOW - 60_000,
    deadlineAtServerMs: NOW + 20 * 60_000,
    submittedAtServerMs: null,
  },
  questions: [
    {
      questionId: '22222222-2222-4222-8222-222222222222',
      stem: 'One?',
      options: ['a', 'b', 'c', 'd'],
    },
    {
      questionId: '33333333-3333-4333-8333-333333333333',
      stem: 'Two?',
      options: ['a', 'b', 'c', 'd'],
    },
  ],
  answers: {},
  resultsReleased: false,
};

function renderAttempt() {
  const { socket, emit } = makeSocket();
  const onViewChange = vi.fn();
  render(
    <ExamAttemptView
      socket={socket}
      view={view}
      offsetMs={0}
      connected
      onViewChange={onViewChange}
    />,
  );
  return { emit, onViewChange };
}

function openConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit exam' }));
  return screen.getByRole('dialog', { name: 'Submit your exam?' });
}

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW,
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => document.documentElement,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ExamAttemptView submit', () => {
  it('confirms inside the page so the browser never leaves full screen', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { emit } = renderAttempt();
    const dialog = openConfirm();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain('You have 2 unanswered questions');
    expect(emitted(emit, 'exam:submit')).toHaveLength(0);
  });

  it('closes on Keep working or Escape without submitting and returns focus to the submit button', () => {
    const { emit } = renderAttempt();
    openConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Keep working' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Submit exam' }));
    const dialog = openConfirm();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(emitted(emit, 'exam:submit')).toHaveLength(0);
  });

  it('sends one submit even when the confirm button is pressed twice', () => {
    const { emit } = renderAttempt();
    openConfirm();
    const confirmButton = screen.getByRole('button', { name: 'Submit now' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    expect(emitted(emit, 'exam:submit')).toHaveLength(1);
  });

  it('stops recording proctor signals once the submission is on its way', () => {
    const { emit } = renderAttempt();
    fireEvent.contextMenu(document);
    expect(emitted(emit, 'proctor:event')).toHaveLength(1);
    openConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit now' }));
    fireEvent.contextMenu(document);
    expect(emitted(emit, 'proctor:event')).toHaveLength(1);
  });

  it('shows the submitted view when the server acknowledges', () => {
    const { emit, onViewChange } = renderAttempt();
    openConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit now' }));
    const ack = emitted(emit, 'exam:submit')[0]?.[2];
    const submitted = { ...view, phase: 'submitted' };
    act(() => ack?.({ ok: true, view: submitted }));
    expect(onViewChange).toHaveBeenCalledWith(submitted);
  });

  it('lets the student try again when the server does not answer in time', () => {
    const { emit } = renderAttempt();
    openConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit now' }));
    expect(
      (screen.getByRole('button', { name: 'Submitting...' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole('alert').textContent).toMatch(/did not confirm/);
    expect(
      (screen.getByRole('button', { name: 'Submit exam' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    openConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit now' }));
    expect(emitted(emit, 'exam:submit')).toHaveLength(2);
  });
});
