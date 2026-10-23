import type { QuizActivity, QuizWithCount } from '@quizup/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(within(fractions).getByText('Waiting')).toBeTruthy();
    expect(within(fractions).queryByText('Live now')).toBeNull();
    await act(async () => {
      fireEvent.click(within(fractions).getByRole('button', { name: 'Copy link' }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/join/K7M2QX`,
    );
    expect(within(card('Unit exam')).queryByRole('button', { name: 'Copy link' })).toBeNull();
  });

  it('shows Live now once the open session is running', async () => {
    vi.mocked(api.getQuizActivity).mockResolvedValue([
      { ...activity[0]!, latest: { ...activity[0]!.latest, status: 'running' } },
    ]);
    renderHost();
    const fractions = await screen.findByRole('article', { name: 'Fractions' });
    expect(within(fractions).getByText('Live now')).toBeTruthy();
    expect(within(fractions).queryByText('Waiting')).toBeNull();
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

  it('creates a quiz and opens it', async () => {
    vi.mocked(api.createQuiz).mockResolvedValue({ ...quizzes[0], id: 'new-quiz' } as QuizWithCount);
    renderHost();
    fireEvent.change(screen.getByLabelText('New quiz title'), { target: { value: 'Decimals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create quiz' }));
    expect(await screen.findByText('Editing new-quiz')).toBeTruthy();
    expect(api.createQuiz).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decimals' }));
  });

  it('asks in a dialog, not the browser, before deleting a quiz', async () => {
    const browserConfirm = vi.spyOn(window, 'confirm');
    vi.mocked(api.deleteQuiz).mockResolvedValue(undefined);
    renderHost();
    await screen.findByRole('article', { name: 'Unit exam' });
    fireEvent.click(within(card('Unit exam')).getByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this quiz?' });
    expect(dialog.textContent).toContain('Unit exam');
    expect(browserConfirm).not.toHaveBeenCalled();
    expect(api.deleteQuiz).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep quiz' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.deleteQuiz).not.toHaveBeenCalled();

    fireEvent.click(within(card('Unit exam')).getByRole('button', { name: /delete/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete quiz' }));
    });
    expect(api.deleteQuiz).toHaveBeenCalledWith(EXAM);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows either the skeleton or the quiz cards, never both', async () => {
    let finishActivity: (value: QuizActivity[]) => void = () => undefined;
    vi.mocked(api.getQuizActivity).mockReturnValue(
      new Promise<QuizActivity[]>((resolve) => {
        finishActivity = resolve;
      }),
    );
    renderHost();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.querySelectorAll('[data-skeleton-row]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('article', { name: 'Fractions' })).toBeNull();

    await act(async () => {
      finishActivity(activity);
    });
    expect(await screen.findByRole('article', { name: 'Fractions' })).toBeTruthy();
    expect(document.querySelectorAll('[data-skeleton-row]')).toHaveLength(0);
  });

  describe('naming a quiz after pressing Create quiz', () => {
    async function openNameDialog() {
      renderHost();
      await screen.findByRole('article', { name: 'Fractions' });
      fireEvent.click(screen.getByRole('button', { name: 'Create quiz' }));
      return screen.getByRole('dialog', { name: 'Name your quiz' });
    }

    it('asks for the title in a dialog when the box is still empty, with the cursor in it', async () => {
      const dialog = await openNameDialog();
      expect(api.createQuiz).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(within(dialog).getByLabelText('Quiz title'));
      expect(screen.getByLabelText('New quiz title').getAttribute('aria-invalid')).toBeNull();
    });

    it('treats a title of only spaces as empty', async () => {
      renderHost();
      await screen.findByRole('article', { name: 'Fractions' });
      fireEvent.change(screen.getByLabelText('New quiz title'), { target: { value: '   ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create quiz' }));
      expect(screen.getByRole('dialog', { name: 'Name your quiz' })).toBeTruthy();
    });

    it('creates the quiz with the title typed in the dialog and opens it', async () => {
      vi.mocked(api.createQuiz).mockResolvedValue({
        ...quizzes[0],
        id: 'new-quiz',
      } as QuizWithCount);
      const dialog = await openNameDialog();
      fireEvent.change(within(dialog).getByLabelText('Quiz title'), {
        target: { value: 'Decimals' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create quiz' }));
      expect(await screen.findByText('Editing new-quiz')).toBeTruthy();
      expect(api.createQuiz).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decimals' }));
    });

    it('does not let the title stay empty in the dialog either', async () => {
      const dialog = await openNameDialog();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create quiz' }));
      const field = within(dialog).getByLabelText('Quiz title');
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(api.createQuiz).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Name your quiz' })).toBeTruthy();
    });

    it('closes with Cancel or Escape and creates nothing', async () => {
      const dialog = await openNameDialog();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Create quiz' }));
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(api.createQuiz).not.toHaveBeenCalled();
    });

    it('shows a server problem inside the dialog and keeps it open', async () => {
      vi.mocked(api.createQuiz).mockRejectedValue(new Error('Could not create the quiz'));
      const dialog = await openNameDialog();
      fireEvent.change(within(dialog).getByLabelText('Quiz title'), {
        target: { value: 'Decimals' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create quiz' }));
      await waitFor(() =>
        expect(within(dialog).getByRole('alert').textContent).toContain('Could not create'),
      );
      expect(screen.getByRole('dialog', { name: 'Name your quiz' })).toBeTruthy();
    });
  });
});
