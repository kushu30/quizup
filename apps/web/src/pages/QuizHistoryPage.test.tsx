import type { QuizSessionHistoryRow } from '@quizup/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { QuizHistoryPage } from './QuizHistoryPage';

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: { getQuiz: vi.fn(), listQuizSessions: vi.fn() },
}));

const QUIZ = '11111111-1111-4111-8111-111111111111';

const ended: QuizSessionHistoryRow = {
  sessionId: '44444444-4444-4444-8444-444444444444',
  joinCode: 'K7M2QX',
  status: 'ended',
  mode: 'live',
  adaptive: true,
  startedAt: '2026-10-19T09:00:00.000Z',
  endedAt: '2026-10-19T09:20:00.000Z',
  participantCount: 28,
  averageScore: 1840,
  feedbackCount: 12,
  averageRating: 4.3,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/host/quizzes/${QUIZ}/history`]}>
      <Routes>
        <Route path="/host/quizzes/:quizId/history" element={<QuizHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.getQuiz).mockResolvedValue({
    id: QUIZ,
    host_id: '22222222-2222-4222-8222-222222222222',
    title: 'Fractions review',
    mode: 'live',
    settings: {},
    created_at: '2026-10-01T10:00:00.000Z',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuizHistoryPage', () => {
  it('lists each session with its numbers and a link to the full summary', async () => {
    vi.mocked(api.listQuizSessions).mockResolvedValue([ended]);
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Fractions review' })).toBeTruthy();
    const table = screen.getByRole('table');
    const row = within(table).getAllByRole('row')[1] as HTMLElement;
    expect(row.textContent).toContain('Adaptive quiz');
    expect(row.textContent).toContain('28');
    expect(row.textContent).toContain('1,840');
    expect(row.textContent).toContain('4.3');
    expect(
      within(row)
        .getByRole('link', { name: /Open summary/ })
        .getAttribute('href'),
    ).toBe('/sessions/44444444-4444-4444-8444-444444444444/summary');
  });

  it('offers to rejoin a session that is still open', async () => {
    vi.mocked(api.listQuizSessions).mockResolvedValue([
      {
        ...ended,
        status: 'lobby',
        startedAt: null,
        endedAt: null,
        averageScore: null,
        averageRating: null,
        feedbackCount: 0,
      },
    ]);
    renderPage();
    const link = await screen.findByRole('link', { name: /Open console/ });
    expect(link.getAttribute('href')).toBe('/host/sessions/44444444-4444-4444-8444-444444444444');
  });

  it('says when the quiz has never been run', async () => {
    vi.mocked(api.listQuizSessions).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/has not been run yet/)).toBeTruthy();
  });
});
