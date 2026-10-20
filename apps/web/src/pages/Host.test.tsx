import type { QuizActivity, QuizWithCount } from '@quizup/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { Host } from './Host';

vi.mock('../lib/api', () => {
  class ApiError extends Error {
    rowErrors: unknown[] = [];
  }
  return {
    ApiError,
    describeError: (error: unknown) =>
      error instanceof Error ? error.message : 'Something went wrong',
    api: {
      listQuizzes: vi.fn(),
      createQuiz: vi.fn(),
      deleteQuiz: vi.fn(),
      getQuizActivity: vi.fn(),
      createSession: vi.fn(),
    },
  };
});

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { name: 'Ms Rivera', email: 'rivera@example.com' } }),
}));

const HOST = '22222222-2222-4222-8222-222222222222';
const FRACTIONS = '11111111-1111-4111-8111-111111111111';
const EXAM = '33333333-3333-4333-8333-333333333333';

const quizzes: QuizWithCount[] = [
  {
    id: FRACTIONS,
    host_id: HOST,
    title: 'Fractions',
    mode: 'live',
    settings: {
      adaptive: true,
      branding: { institutionName: 'Lincoln High', brandColor: '#7A1F2B' },
    },
    created_at: '2026-10-01T10:00:00.000Z',
    question_count: 12,
  },
  {
    id: EXAM,
    host_id: HOST,
    title: 'Unit exam',
    mode: 'exam',
    settings: { mode: 'exam', durationMinutes: 40 },
    created_at: '2026-10-02T10:00:00.000Z',
    question_count: 1,
  },
];

const activity: QuizActivity[] = [
  {
    quizId: FRACTIONS,
    sessionCount: 3,
    latest: {
      sessionId: '44444444-4444-4444-8444-444444444444',
      joinCode: 'K7M2QX',
      status: 'lobby',
      startedAt: null,
      endedAt: null,
    },
  },
];

function EditorProbe() {
  return <p>Editing {useParams().quizId}</p>;
}

function ConsoleProbe() {
  return <p>Console {useParams().sessionId}</p>;
}

function renderHost() {
  return render(
    <MemoryRouter initialEntries={['/host']}>
      <Routes>
        <Route path="/host" element={<Host />} />
        <Route path="/host/quizzes/:quizId" element={<EditorProbe />} />
        <Route path="/host/sessions/:sessionId" element={<ConsoleProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function card(title: string) {
  return screen.getByRole('article', { name: title });
}

beforeEach(() => {
  vi.mocked(api.listQuizzes).mockResolvedValue(quizzes);
  vi.mocked(api.getQuizActivity).mockResolvedValue(activity);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Host dashboard', () => {
  it('shows a card per quiz with its type, question count and brand', async () => {
    renderHost();
    const fractions = await screen.findByRole('article', { name: 'Fractions' });
    expect(fractions.textContent).toContain('Adaptive quiz');
    expect(fractions.textContent).toContain('12 questions');
    expect(fractions.textContent).toContain('Lincoln High');
    const exam = card('Unit exam');
    expect(exam.textContent).toContain('Timed exam');
    expect(exam.textContent).toContain('1 question');
    expect(exam.textContent).toContain('Never run');
  });

  it('marks a quiz with an open session and lets the host copy its join link', async () => {
    renderHost();
    const fractions = await screen.findByRole('article', { name: 'Fractions' });
    expect(within(fractions).getByText('Live now')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(fractions).getByRole('button', { name: 'Copy link' }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/join/K7M2QX`,
    );
    expect(within(card('Unit exam')).queryByRole('button', { name: 'Copy link' })).toBeNull();
  });

  it('links to the editor and the history of each quiz', async () => {
    renderHost();
    const fractions = await screen.findByRole('article', { name: 'Fractions' });
    expect(within(fractions).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      `/host/quizzes/${FRACTIONS}`,
    );
    expect(within(fractions).getByRole('link', { name: 'History' }).getAttribute('href')).toBe(
      `/host/quizzes/${FRACTIONS}/history`,
    );
  });

  it('runs a quiz by starting a session and opening the console', async () => {
    vi.mocked(api.createSession).mockResolvedValue({
      session: { id: '55555555-5555-4555-8555-555555555555' },
    } as Awaited<ReturnType<typeof api.createSession>>);
    renderHost();
    await screen.findByRole('article', { name: 'Unit exam' });
    fireEvent.click(within(card('Unit exam')).getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Console 55555555-5555-4555-8555-555555555555')).toBeTruthy();
    expect(api.createSession).toHaveBeenCalledWith(expect.objectContaining({ quizId: EXAM }));
  });

  it('shows the validation message on the title field when it is empty', async () => {
    renderHost();
    await screen.findByRole('article', { name: 'Fractions' });
    fireEvent.click(screen.getByRole('button', { name: 'Create quiz' }));
    expect(screen.getByLabelText('New quiz title').getAttribute('aria-invalid')).toBe('true');
    expect(api.createQuiz).not.toHaveBeenCalled();
  });

  it('creates a quiz and opens it', async () => {
    vi.mocked(api.createQuiz).mockResolvedValue({ ...quizzes[0], id: 'new-quiz' } as QuizWithCount);
    renderHost();
    fireEvent.change(screen.getByLabelText('New quiz title'), { target: { value: 'Decimals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create quiz' }));
    expect(await screen.findByText('Editing new-quiz')).toBeTruthy();
    expect(api.createQuiz).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decimals' }));
  });
});
