import {
  EXAM_CONSENT_MEDIA_VERSION,
  EXAM_CONSENT_VERSION,
  type ExamStudentView,
} from '@quizup/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizSocket } from '../../lib/socket';
import { Layout } from '../Layout';
import { ExamPlay } from './ExamPlay';

vi.mock('../SystemStatus', () => ({ SystemStatus: () => null }));
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ session: null, canHost: false, isAdmin: false, signOut: vi.fn() }),
}));

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
      proctored
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

describe('ExamPlay navigation', () => {
  function renderInLayout(view: ExamStudentView) {
    const socket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as unknown as QuizSocket;
    return render(
      <MemoryRouter initialEntries={['/play/ABC234']}>
        <Routes>
          <Route element={<Layout />}>
            <Route
              path="/play/:code"
              element={
                <ExamPlay
                  socket={socket}
                  view={view}
                  displayName="Ada"
                  offsetMs={0}
                  connected
                  proctored
                  onViewChange={() => undefined}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  const running: ExamStudentView = {
    ...viewIn('in_progress'),
    attempt: {
      attemptId: '11111111-1111-4111-8111-111111111111',
      startedAtServerMs: Date.now(),
      deadlineAtServerMs: Date.now() + 20 * 60_000,
      submittedAtServerMs: null,
    },
  };

  it('hides the site navigation while the student is taking the exam', () => {
    renderInLayout(running);
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Join a quiz' })).toBeNull();
  });

  it('shows the site navigation again before the exam starts and after it ends', () => {
    renderInLayout(viewIn('consent'));
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    cleanup();
    renderInLayout(viewIn('submitted'));
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
  });
});

describe('ExamPlay camera and microphone', () => {
  function renderWith(
    phase: ExamStudentView['phase'],
    extra: Partial<React.ComponentProps<typeof ExamPlay>> = {},
  ) {
    const emit = vi.fn();
    const socket = { emit, on: vi.fn(), off: vi.fn() } as unknown as QuizSocket;
    render(
      <ExamPlay
        socket={socket}
        view={viewIn(phase)}
        displayName="Ada"
        offsetMs={0}
        connected
        proctored
        onViewChange={() => undefined}
        {...extra}
      />,
    );
    return emit;
  }

  it('accepts with the media consent version when the camera is on', () => {
    const emit = renderWith('consent', {
      media: { camera: true, mic: false, flagLimit: 10 },
    });
    fireEvent.click(screen.getByRole('button', { name: /accept and start the exam/i }));
    expect(emit).toHaveBeenCalledWith(
      'exam:start',
      { consentVersion: EXAM_CONSENT_MEDIA_VERSION },
      expect.any(Function),
    );
    expect(
      screen.getByText('If you are flagged 10 times, your exam is submitted automatically.'),
    ).toBeTruthy();
  });

  it('accepts with the ordinary consent version when no device is on', () => {
    const emit = renderWith('consent');
    fireEvent.click(screen.getByRole('button', { name: /accept and start the exam/i }));
    expect(emit).toHaveBeenCalledWith(
      'exam:start',
      { consentVersion: EXAM_CONSENT_VERSION },
      expect.any(Function),
    );
  });

  it('explains an exam that proctoring submitted', () => {
    renderWith('submitted', { submitReason: 'proctor_limit' });
    expect(
      screen.getByText(/submitted because it reached the proctoring flag limit/i),
    ).toBeTruthy();
  });

  it('says nothing special for an ordinary submit', () => {
    renderWith('submitted', { submitReason: 'student' });
    expect(screen.queryByText(/flag limit/i)).toBeNull();
  });
});
