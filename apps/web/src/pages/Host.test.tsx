import type { QuizWithCount } from '@quizup/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    api: { listQuizzes: vi.fn(), createQuiz: vi.fn(), deleteQuiz: vi.fn() },
  };
});

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { name: 'Ms Rivera', email: 'rivera@example.com' } }),
}));

const quizzes: QuizWithCount[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    host_id: '22222222-2222-4222-8222-222222222222',
    title: 'Fractions',
    mode: 'live',
    settings: {},
    created_at: '2026-10-01T10:00:00.000Z',
    question_count: 12,
  } as QuizWithCount,
];

function EditorProbe() {
  return <p>Editing {useParams().quizId}</p>;
}

function renderHost() {
  return render(
    <MemoryRouter initialEntries={['/host']}>
      <Routes>
        <Route path="/host" element={<Host />} />
        <Route path="/host/quizzes/:quizId" element={<EditorProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.listQuizzes).mockResolvedValue(quizzes);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Host dashboard', () => {
  it('lists quizzes with their question count and links to the editor', async () => {
    renderHost();
    const link = await screen.findByRole('link', { name: /Fractions/ });
    expect(link.getAttribute('href')).toBe('/host/quizzes/11111111-1111-4111-8111-111111111111');
    expect(link.textContent).toContain('12 questions');
  });

  it('shows the validation message on the title field when it is empty', async () => {
    renderHost();
    await screen.findByRole('link', { name: /Fractions/ });
    fireEvent.click(screen.getByRole('button', { name: 'Create quiz' }));
    const input = screen.getByLabelText('New quiz title');
    expect(input.getAttribute('aria-invalid')).toBe('true');
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
