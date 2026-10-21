import type { MyResultRow } from '@quizup/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { MyResultsPage } from './MyResultsPage';

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: { getMyResults: vi.fn() },
}));

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ session: {}, profile: { role: 'student' }, loading: false }),
}));

const live: MyResultRow = {
  sessionId: '44444444-4444-4444-8444-444444444444',
  quizTitle: 'Fractions review',
  branding: { institutionName: 'Lincoln High' },
  mode: 'live',
  adaptive: false,
  endedAt: '2026-10-19T09:20:00.000Z',
  score: 1840,
  rank: 3,
  participantCount: 28,
  resultsHidden: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <MyResultsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MyResultsPage', () => {
  it('shows each past assessment with its brand, score and rank', async () => {
    vi.mocked(api.getMyResults).mockResolvedValue([live]);
    renderPage();
    expect(await screen.findByText('Fractions review')).toBeTruthy();
    expect(screen.getByText('Lincoln High')).toBeTruthy();
    expect(screen.getByText('1,840 points')).toBeTruthy();
    expect(screen.getByText('Rank 3 of 28')).toBeTruthy();
  });

  it('keeps unreleased exam scores hidden', async () => {
    vi.mocked(api.getMyResults).mockResolvedValue([
      { ...live, mode: 'exam', score: null, rank: null, resultsHidden: true },
    ]);
    renderPage();
    expect(await screen.findByText('Results not released yet')).toBeTruthy();
    expect(screen.queryByText(/points/)).toBeNull();
  });

  it('explains how results get here when there are none', async () => {
    vi.mocked(api.getMyResults).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/while signed in, your results appear here/)).toBeTruthy();
  });

  it('links a finished result to its details, but not an unreleased exam', async () => {
    vi.mocked(api.getMyResults).mockResolvedValue([
      live,
      {
        ...live,
        sessionId: '55555555-5555-4555-8555-555555555555',
        quizTitle: 'Midterm',
        mode: 'exam',
        resultsHidden: true,
      },
    ]);
    renderPage();
    const link = await screen.findByRole('link', { name: /Fractions review/ });
    expect(link.getAttribute('href')).toBe(`/me/results/${live.sessionId}`);
    expect(screen.queryByRole('link', { name: /Midterm/ })).toBeNull();
    expect(screen.getByText('Midterm')).toBeTruthy();
  });
});
