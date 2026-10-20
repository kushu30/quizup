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

function renderAttempt(initiallyConnected = true, proctored = true) {
  const { socket, emit } = makeSocket();
  const onViewChange = vi.fn();
  const attempt = (connected: boolean, currentView: ExamStudentView = view) => (
    <ExamAttemptView
      socket={socket}
      view={currentView}
      offsetMs={0}
      connected={connected}
      proctored={proctored}
      onViewChange={onViewChange}
    />
  );
  const { rerender } = render(attempt(initiallyConnected));
  return {
    emit,
    onViewChange,
    setConnected: (connected: boolean, currentView?: ExamStudentView) =>
      rerender(attempt(connected, currentView)),
  };
}

function pickOption(letter: string) {
  fireEvent.click(screen.getByRole('radio', { name: letter.toLowerCase() }));
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

describe('ExamAttemptView answers while offline', () => {
  const FIRST = '22222222-2222-4222-8222-222222222222';

  it('keeps an answer picked offline and sends it once the seat is back', () => {
    const { emit, setConnected } = renderAttempt(false);
    expect(screen.getByRole('status', { name: /reconnecting/i })).toBeTruthy();
    pickOption('B');
    expect(emitted(emit, 'exam:answer')).toHaveLength(0);
    expect(screen.getByRole('radio', { name: 'b' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('1 answer waiting to send')).toBeTruthy();

    setConnected(true);
    const sent = emitted(emit, 'exam:answer');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[1]).toEqual({ questionId: FIRST, displayedIndex: 1 });
    act(() => sent[0]?.[2]?.({ ok: true, answeredCount: 1 }));
    expect(screen.queryByText(/waiting to send/)).toBeNull();
  });

  it('says nothing while an answer is simply on its way', () => {
    const { emit } = renderAttempt();
    pickOption('A');
    expect(emitted(emit, 'exam:answer')).toHaveLength(1);
    expect(screen.queryByText(/waiting to send/)).toBeNull();
    expect(screen.queryByText(/sending/i)).toBeNull();
  });

  it('does not lose an offline answer when the server sends a fresh copy of the exam', () => {
    const { setConnected } = renderAttempt(false);
    pickOption('C');
    setConnected(true, { ...view, answers: {} });
    expect(screen.getByRole('radio', { name: 'c' }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the answer and tries again when the server could not save it yet', () => {
    const { emit } = renderAttempt();
    pickOption('A');
    const first = emitted(emit, 'exam:answer')[0]?.[2];
    act(() => first?.({ ok: false, error: 'not_in_room' }));
    expect(screen.getByRole('radio', { name: 'a' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(/waiting to send/)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.getByText('1 answer waiting to send')).toBeTruthy();
    expect(emitted(emit, 'exam:answer')).toHaveLength(2);
  });

  it('takes the answer back and says time is up when the attempt has expired', () => {
    const { emit } = renderAttempt();
    pickOption('D');
    act(() => emitted(emit, 'exam:answer')[0]?.[2]?.({ ok: false, error: 'attempt_expired' }));
    expect(screen.getByRole('radio', { name: 'd' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('alert').textContent).toMatch(/time is up/i);
    expect(screen.queryByText(/waiting to send/)).toBeNull();
  });

  it('holds the submit button until the connection is back', () => {
    const { setConnected } = renderAttempt(false);
    expect(
      (screen.getByRole('button', { name: 'Submit exam' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/submit once you are back online/i)).toBeTruthy();
    setConnected(true);
    expect(
      (screen.getByRole('button', { name: 'Submit exam' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('ExamAttemptView timer', () => {
  it('shows the time left as a large clock', () => {
    renderAttempt();
    const timer = screen.getByRole('timer');
    expect(timer.textContent).toContain('20:00');
    expect(timer.textContent).toContain('Time left');
    expect(timer.getAttribute('data-urgency')).toBe('calm');
  });

  it('counts down every second', () => {
    renderAttempt();
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByRole('timer').textContent).toContain('18:55');
  });

  it('warns at ten minutes, five minutes and the last minute', () => {
    renderAttempt();
    act(() => {
      vi.advanceTimersByTime(10 * 60_000 + 2000);
    });
    let timer = screen.getByRole('timer');
    expect(timer.getAttribute('data-urgency')).toBe('soon');
    expect(timer.textContent).toContain('10 minutes left');
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    timer = screen.getByRole('timer');
    expect(timer.textContent).toContain('5 minutes left');
    act(() => {
      vi.advanceTimersByTime(4 * 60_000 + 30_000);
    });
    timer = screen.getByRole('timer');
    expect(timer.getAttribute('data-urgency')).toBe('urgent');
    expect(timer.textContent).toContain('Last minute');
  });

  it('announces each milestone to screen readers once', () => {
    renderAttempt();
    expect(screen.queryByRole('status', { name: 'Time warning' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10 * 60_000 + 2000);
    });
    expect(screen.getByRole('status', { name: 'Time warning' }).textContent).toBe(
      '10 minutes left',
    );
  });

  it('shows how many questions are answered', () => {
    renderAttempt();
    expect(screen.getByText('0 of 2 answered')).toBeTruthy();
    pickOption('A');
    expect(screen.getByText('1 of 2 answered')).toBeTruthy();
  });
});

describe('ExamAttemptView without proctoring', () => {
  it('records no signals and never demands full screen', () => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null,
    });
    const { emit } = renderAttempt(true, false);
    fireEvent.contextMenu(document);
    expect(emitted(emit, 'proctor:event')).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('still asks for full screen and records signals when proctored', () => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null,
    });
    const { emit } = renderAttempt(true, true);
    expect(screen.getByRole('alertdialog', { name: 'Full screen required' })).toBeTruthy();
    fireEvent.contextMenu(document);
    expect(emitted(emit, 'proctor:event').length).toBeGreaterThan(0);
  });

  it('shows a question’s picture above its answers', () => {
    const { socket } = makeSocket();
    const withImage: ExamStudentView = {
      ...view,
      questions: [
        {
          ...(view.questions[0] as (typeof view.questions)[number]),
          imageUrl: 'https://x.test/a.png',
          imageAlt: 'A cat on a sofa',
        },
        view.questions[1] as (typeof view.questions)[number],
      ],
    };
    render(
      <ExamAttemptView
        socket={socket}
        view={withImage}
        offsetMs={0}
        connected
        proctored={false}
        onViewChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'A cat on a sofa' })).toBeTruthy();
  });
});
