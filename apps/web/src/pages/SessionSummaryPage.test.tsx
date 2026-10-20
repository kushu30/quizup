import type { AnalyticsSnapshot, Quiz } from '@quizup/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { SessionSummaryPage } from './SessionSummaryPage';

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: {
    getSessionSummary: vi.fn(),
    getSession: vi.fn(),
    getQuiz: vi.fn(),
    downloadExport: vi.fn(),
    getSessionFeedback: vi.fn(),
  },
}));

const SESSION = '44444444-4444-4444-8444-444444444444';
const QUIZ = '11111111-1111-4111-8111-111111111111';

const snapshot = {
  sessionId: SESSION,
  source: 'live',
  mode: 'live',
  status: 'ended',
  generatedAtMs: 1,
  adaptive: false,
  totalRounds: 1,
  roundsCompleted: 1,
  currentRound: null,
  checkpointRound: null,
  topics: [],
  questions: [],
  sessionHistogram: Array(10).fill(0),
  currentRoundHistogram: Array(10).fill(0),
  participants: [],
  leaderboard: [],
} as unknown as AnalyticsSnapshot;

const quiz: Quiz = {
  id: QUIZ,
  host_id: '22222222-2222-4222-8222-222222222222',
  title: 'Fractions review',
  mode: 'live',
  settings: { branding: { institutionName: 'Lincoln High' } },
  created_at: '2026-10-01T10:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/sessions/${SESSION}/summary`]}>
      <Routes>
        <Route path="/sessions/:sessionId/summary" element={<SessionSummaryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.getSessionSummary).mockResolvedValue(snapshot);
  vi.mocked(api.getSession).mockResolvedValue({
    session: { quiz_id: QUIZ },
  } as Awaited<ReturnType<typeof api.getSession>>);
  vi.mocked(api.getQuiz).mockResolvedValue(quiz);
  vi.mocked(api.getSessionFeedback).mockResolvedValue({ count: 0, averageRating: null, items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionSummaryPage branding', () => {
  it('names the quiz and shows the institution brand', async () => {
    renderPage();
    expect(await screen.findByText('Lincoln High')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Fractions review' })).toBeTruthy();
  });

  it('still shows the summary when the quiz cannot be loaded', async () => {
    vi.mocked(api.getSession).mockRejectedValue(new Error('Session not found'));
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Session summary' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('SessionSummaryPage feedback', () => {
  it('shows the average rating and every comment', async () => {
    vi.mocked(api.getSessionFeedback).mockResolvedValue({
      count: 2,
      averageRating: 4.5,
      items: [
        {
          displayName: 'Ada',
          rating: 4,
          comment: 'Question 3 was tricky',
          createdAt: '2026-10-19T10:00:00Z',
        },
        { displayName: 'Grace', rating: 5, comment: null, createdAt: '2026-10-19T10:01:00Z' },
      ],
    });
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Student feedback' });
    expect(panel.textContent).toContain('4.5 out of 5');
    expect(panel.textContent).toContain('2 responses');
    expect(panel.textContent).toContain('Question 3 was tricky');
    expect(panel.textContent).toContain('Ada');
  });

  it('says when nobody has left feedback yet', async () => {
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Student feedback' });
    expect(panel.textContent).toContain('No feedback yet');
  });
});
