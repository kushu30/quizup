import type { Question, Quiz } from '@quizup/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { QuizEditor } from './QuizEditor';

vi.mock('../lib/supabase', () => ({ supabase: { storage: { from: vi.fn() } } }));

vi.mock('../lib/api', () => {
  class ApiError extends Error {
    rowErrors: unknown[] = [];
  }
  return {
    ApiError,
    describeError: (error: unknown) =>
      error instanceof Error ? error.message : 'Something went wrong',
    api: {
      getQuiz: vi.fn(),
      updateQuiz: vi.fn(),
      deleteQuiz: vi.fn(),
      listQuestions: vi.fn(),
      listTopics: vi.fn(),
      createSession: vi.fn(),
      approveQuestions: vi.fn(),
      createQuestion: vi.fn(),
    },
  };
});

const QUIZ_ID = '11111111-1111-4111-8111-111111111111';

const quiz: Quiz = {
  id: QUIZ_ID,
  host_id: '22222222-2222-4222-8222-222222222222',
  title: 'Fractions',
  mode: 'live',
  settings: { mode: 'live', adaptive: false, useLearnerHistory: true },
  created_at: '2026-10-01T10:00:00.000Z',
};

const approvedQuestion: Question = {
  id: '33333333-3333-4333-8333-333333333333',
  quiz_id: QUIZ_ID,
  topic: 'Fractions',
  stem: 'What is one half of 8?',
  options: ['4', '2', '6', '8'],
  correct_index: 0,
  difficulty: 'easy',
  elo_rating: 1000,
  source: 'manual',
  approved: true,
  position: 1,
};

function SessionProbe() {
  const location = useLocation();
  return <p>Console at {location.pathname}</p>;
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={[`/host/quizzes/${QUIZ_ID}`]}>
      <Routes>
        <Route path="/host/quizzes/:quizId" element={<QuizEditor />} />
        <Route path="/host/sessions/:sessionId" element={<SessionProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockQuestions(approved: Question[]) {
  vi.mocked(api.listQuestions).mockImplementation(async (query) =>
    query.approval === 'approved' ? approved : [],
  );
}

beforeEach(() => {
  vi.mocked(api.getQuiz).mockResolvedValue(quiz);
  vi.mocked(api.listTopics).mockResolvedValue([]);
  vi.mocked(api.updateQuiz).mockImplementation(
    async (_id, changes) => ({ ...quiz, ...changes }) as Quiz,
  );
  mockQuestions([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuizEditor', () => {
  it('walks a new quiz through the steps and ends on a review of everything', async () => {
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    const steps = screen.getByRole('navigation', { name: 'Editor steps' });
    expect(
      within(steps)
        .getByRole('button', { name: /^Details/ })
        .getAttribute('aria-current'),
    ).toBe('step');
    expect(screen.queryByRole('region', { name: 'Branding' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('region', { name: 'Branding' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^Add questions$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByRole('region', { name: /^Add questions$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review quiz' }));
    expect(await screen.findByRole('region', { name: /^Details and mode$/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Branding' })).toBeTruthy();
  });

  it('saves unsaved details before moving on from the first step', async () => {
    renderEditor();
    fireEvent.change(await screen.findByLabelText('Quiz title'), { target: { value: 'Decimals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('region', { name: 'Branding' })).toBeTruthy();
  });

  it('opens a quiz that already has questions on its review', async () => {
    mockQuestions([approvedQuestion]);
    renderEditor();
    expect(await screen.findByRole('region', { name: /^Approved questions/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Branding' })).toBeTruthy();
  });

  it('groups the review into named sections', async () => {
    mockQuestions([approvedQuestion]);
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    for (const name of [
      /^Details and mode$/,
      /^Live session$/,
      /^Add questions$/,
      /^Needs review/,
      /^Approved questions/,
    ]) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
  });

  it('labels the title and offers one assessment type choice', async () => {
    renderEditor();
    expect(((await screen.findByLabelText('Quiz title')) as HTMLInputElement).value).toBe(
      'Fractions',
    );
    expect(screen.getByRole('radiogroup', { name: 'Assessment type' })).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Live quiz/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.queryByLabelText('Exam mode')).toBeNull();
    expect(screen.queryByLabelText('Rounds')).toBeNull();
  });

  it('saves a timed exam with its length', async () => {
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    fireEvent.click(screen.getByRole('radio', { name: /Timed exam/ }));
    fireEvent.change(screen.getByLabelText('Exam length in minutes'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
    const [id, changes] = vi.mocked(api.updateQuiz).mock.calls[0] ?? [];
    expect(id).toBe(QUIZ_ID);
    expect(changes?.mode).toBe('exam');
    expect(changes?.settings).toMatchObject({ mode: 'exam', durationMinutes: 45, adaptive: false });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('saves an adaptive quiz as a live quiz with adaptive selection', async () => {
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    fireEvent.click(screen.getByRole('radio', { name: /Adaptive quiz/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
    const [, changes] = vi.mocked(api.updateQuiz).mock.calls[0] ?? [];
    expect(changes?.mode).toBe('live');
    expect(changes?.settings).toMatchObject({ mode: 'live', adaptive: true });
  });

  it('offers who can join and saves invited-only as token access', async () => {
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    expect(screen.getByRole('radiogroup', { name: 'Who can join' })).toBeTruthy();
    expect(
      (screen.getByRole('radio', { name: /Anyone with the code/ }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Invited students only/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
    const [, changes] = vi.mocked(api.updateQuiz).mock.calls[0] ?? [];
    expect(changes?.settings).toMatchObject({ accessMode: 'token' });
  });

  it('shows the saved access setting when the quiz loads', async () => {
    vi.mocked(api.getQuiz).mockResolvedValue({
      ...quiz,
      settings: { mode: 'live', adaptive: false, accessMode: 'token' },
    });
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    await waitFor(() =>
      expect(
        (screen.getByRole('radio', { name: /Invited students only/ }) as HTMLInputElement).checked,
      ).toBe(true),
    );
  });

  it('shows the saved assessment type when the quiz loads', async () => {
    vi.mocked(api.getQuiz).mockResolvedValue({
      ...quiz,
      mode: 'exam',
      settings: { mode: 'exam', durationMinutes: 40, adaptive: false },
    });
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    expect((screen.getByRole('radio', { name: /Timed exam/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText('Exam length in minutes') as HTMLInputElement).value).toBe('40');
  });

  it('saves branding without touching the assessment settings', async () => {
    vi.mocked(api.getQuiz).mockResolvedValue({
      ...quiz,
      mode: 'exam',
      settings: { mode: 'exam', durationMinutes: 40, adaptive: false },
    });
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    fireEvent.click(screen.getByRole('button', { name: /^Branding/ }));
    const branding = await screen.findByRole('region', { name: 'Branding' });
    fireEvent.change(within(branding).getByLabelText('Institution name'), {
      target: { value: 'Lincoln High' },
    });
    fireEvent.click(within(branding).getByRole('button', { name: 'Save branding' }));
    await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
    const [, changes] = vi.mocked(api.updateQuiz).mock.calls[0] ?? [];
    expect(changes?.settings).toMatchObject({
      mode: 'exam',
      durationMinutes: 40,
      branding: { institutionName: 'Lincoln High' },
    });
  });

  it('keeps the start button disabled until a question is approved', async () => {
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    const start = screen.getByRole('button', { name: 'Start live session' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('starts a live session with the chosen seconds per question', async () => {
    mockQuestions([approvedQuestion]);
    vi.mocked(api.createSession).mockResolvedValue({
      session: { id: '44444444-4444-4444-8444-444444444444' },
    } as Awaited<ReturnType<typeof api.createSession>>);
    renderEditor();
    const start = (await screen.findByRole('button', {
      name: 'Start live session',
    })) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Seconds per question'), { target: { value: '30' } });
    fireEvent.click(start);
    await screen.findByText('Console at /host/sessions/44444444-4444-4444-8444-444444444444');
    expect(api.createSession).toHaveBeenCalledWith({
      quizId: QUIZ_ID,
      questionDurationSeconds: 30,
    });
  });

  it('suggests this quiz’s modules when writing a question', async () => {
    vi.mocked(api.listTopics).mockResolvedValue(['Module 1', 'Module 2']);
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Editor steps' })).getByRole('button', {
        name: /^Questions/,
      }),
    );
    const field = await screen.findByLabelText('Module (optional)');
    const list = document.getElementById(field.getAttribute('list') ?? '');
    expect(
      Array.from(list?.querySelectorAll('option') ?? []).map((o) => o.getAttribute('value')),
    ).toEqual(['Module 1', 'Module 2']);
    expect(api.listTopics).toHaveBeenCalledWith(expect.any(String));
  });

  describe('shuffling question order', () => {
    it('is off by default, with a plain explanation', async () => {
      renderEditor();
      const box = (await screen.findByLabelText('Shuffle question order')) as HTMLInputElement;
      expect(box.checked).toBe(false);
      expect(
        screen.getByText(/Off: students get the questions in the order shown below/),
      ).toBeTruthy();
    });

    it('is saved with the other details', async () => {
      renderEditor();
      fireEvent.click(await screen.findByLabelText('Shuffle question order'));
      fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
      await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
      expect(vi.mocked(api.updateQuiz).mock.calls[0]?.[1]?.settings).toMatchObject({
        shuffleQuestions: true,
      });
    });

    it('shows a quiz that was saved with shuffling on', async () => {
      vi.mocked(api.getQuiz).mockResolvedValue({ ...quiz, settings: { shuffleQuestions: true } });
      renderEditor();
      expect(
        ((await screen.findByLabelText('Shuffle question order')) as HTMLInputElement).checked,
      ).toBe(true);
    });

    it('is not offered for an adaptive quiz, which picks questions by rating', async () => {
      renderEditor();
      await screen.findByDisplayValue('Fractions');
      fireEvent.click(screen.getByRole('radio', { name: /Adaptive/ }));
      expect(screen.queryByLabelText('Shuffle question order')).toBeNull();
    });
  });

  describe('delivery by assessment type', () => {
    const examQuiz = {
      ...quiz,
      mode: 'exam' as const,
      settings: { mode: 'exam', durationMinutes: 30 },
    };

    it('shows both shuffles on for an exam that never chose', async () => {
      vi.mocked(api.getQuiz).mockResolvedValue(examQuiz as Quiz);
      renderEditor();
      expect(
        ((await screen.findByLabelText('Shuffle question order')) as HTMLInputElement).checked,
      ).toBe(true);
      expect((screen.getByLabelText('Shuffle answer options') as HTMLInputElement).checked).toBe(
        true,
      );
    });

    it('resets the shuffles to the new type’s defaults when the type changes', async () => {
      renderEditor();
      await screen.findByLabelText('Shuffle question order');
      expect(screen.queryByLabelText('Shuffle answer options')).toBeNull();
      fireEvent.click(screen.getByRole('radio', { name: /Timed exam/ }));
      expect((screen.getByLabelText('Shuffle question order') as HTMLInputElement).checked).toBe(
        true,
      );
      expect((screen.getByLabelText('Shuffle answer options') as HTMLInputElement).checked).toBe(
        true,
      );
      fireEvent.click(screen.getByRole('radio', { name: /Live quiz/ }));
      expect((screen.getByLabelText('Shuffle question order') as HTMLInputElement).checked).toBe(
        false,
      );
      expect(screen.queryByLabelText('Shuffle answer options')).toBeNull();
    });

    it('saves an exam with its shuffles turned off', async () => {
      vi.mocked(api.getQuiz).mockResolvedValue(examQuiz as Quiz);
      renderEditor();
      fireEvent.click(await screen.findByLabelText('Shuffle question order'));
      fireEvent.click(screen.getByLabelText('Shuffle answer options'));
      fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
      await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
      expect(vi.mocked(api.updateQuiz).mock.calls[0]?.[1]?.settings).toMatchObject({
        mode: 'exam',
        shuffleQuestions: false,
        shuffleOptions: false,
      });
    });
  });

  describe('question pools', () => {
    const inModule = (id: string, topic: string): Question => ({ ...approvedQuestion, id, topic });

    it('counts the approved questions in each module and saves the rules', async () => {
      mockQuestions([
        inModule('a1', 'Module 1'),
        inModule('a2', 'Module 1'),
        inModule('a3', 'Module 1'),
        inModule('b1', 'Module 2'),
      ]);
      renderEditor();
      await screen.findByLabelText('Shuffle question order');
      const add = await screen.findByRole('button', { name: 'Add a pool rule' });
      await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(add);
      expect(await screen.findByText('of 3 approved questions')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Questions to draw from Module 1'), {
        target: { value: '2' },
      });
      expect(screen.getByText('Each student gets 3 of 4 questions.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
      await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
      expect(vi.mocked(api.updateQuiz).mock.calls[0]?.[1]?.settings).toMatchObject({
        pools: [{ module: 'Module 1', count: 2 }],
      });
    });

    it('shows a saved rule when the quiz is opened', async () => {
      vi.mocked(api.getQuiz).mockResolvedValue({
        ...quiz,
        settings: { pools: [{ module: 'Fractions', count: 1 }] },
      });
      mockQuestions([approvedQuestion]);
      renderEditor();
      expect(await screen.findByRole('group', { name: 'Pool rule for Fractions' })).toBeTruthy();
    });

    it('is not offered for an adaptive quiz and saves no rules for it', async () => {
      vi.mocked(api.getQuiz).mockResolvedValue({
        ...quiz,
        settings: { pools: [{ module: 'Fractions', count: 1 }] },
      });
      mockQuestions([approvedQuestion]);
      renderEditor();
      await screen.findByRole('group', { name: 'Pool rule for Fractions' });
      fireEvent.click(screen.getByRole('radio', { name: /Adaptive/ }));
      expect(screen.queryByText('Question pools')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
      await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
      expect(vi.mocked(api.updateQuiz).mock.calls[0]?.[1]?.settings).toMatchObject({ pools: [] });
    });
  });
});
