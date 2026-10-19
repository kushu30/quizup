import type { Question, Quiz } from '@quizup/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { QuizEditor } from './QuizEditor';

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
  it('groups the editor into named sections', async () => {
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

  it('labels the title and mode controls', async () => {
    renderEditor();
    expect(((await screen.findByLabelText('Quiz title')) as HTMLInputElement).value).toBe(
      'Fractions',
    );
    expect(screen.getByLabelText('Exam mode')).toBeTruthy();
    expect(screen.getByLabelText('Adaptive mode')).toBeTruthy();
  });

  it('saves exam settings with adaptive selection switched off', async () => {
    renderEditor();
    await screen.findByDisplayValue('Fractions');
    fireEvent.click(screen.getByLabelText('Adaptive mode'));
    fireEvent.click(screen.getByLabelText('Exam mode'));
    fireEvent.change(screen.getByLabelText('Exam length in minutes'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
    const [id, changes] = vi.mocked(api.updateQuiz).mock.calls[0] ?? [];
    expect(id).toBe(QUIZ_ID);
    expect(changes?.settings).toMatchObject({ mode: 'exam', durationMinutes: 45, adaptive: false });
    expect(await screen.findByText('Saved')).toBeTruthy();
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
});
