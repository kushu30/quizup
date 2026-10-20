import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ getMyResult: vi.fn() }));

vi.mock('../lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string | null;
    constructor(message: string, options: { status?: number; code?: string | null } = {}) {
      super(message);
      this.status = options.status ?? 0;
      this.code = options.code ?? null;
    }
  }
  return {
    ApiError,
    describeError: (error: unknown) =>
      error instanceof Error ? error.message : 'Something went wrong',
    api: apiMock,
  };
});
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ session: {}, profile: { role: 'student' }, loading: false }),
}));

import { ApiError } from '../lib/api';
import { MyResultDetailPage } from './MyResultDetailPage';

const SESSION = '20000000-0000-4000-8000-000000000001';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/me/results/${SESSION}`]}>
      <Routes>
        <Route path="/me/results/:sessionId" element={<MyResultDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MyResultDetailPage', () => {
  it('explains that an exam result has not been released yet', async () => {
    apiMock.getMyResult.mockRejectedValue(
      new ApiError('results_not_released', { status: 409, code: 'results_not_released' }),
    );
    renderPage();
    expect(await screen.findByText(/has not released the results yet/)).toBeTruthy();
  });

  it('says a result it cannot find may belong to another account', async () => {
    apiMock.getMyResult.mockRejectedValue(new ApiError('nope', { status: 404 }));
    renderPage();
    expect(await screen.findByText(/may belong to another account/)).toBeTruthy();
  });

  it('shows the result when it loads', async () => {
    apiMock.getMyResult.mockResolvedValue({
      sessionId: SESSION,
      participantId: '30000000-0000-4000-8000-000000000001',
      displayName: 'Asha',
      quizTitle: 'Fractions',
      mode: 'live',
      adaptive: false,
      score: 300,
      rank: 1,
      participantCount: 4,
      totalQuestions: 0,
      answered: 0,
      correct: 0,
      accuracy: null,
      timeTakenMs: 10_000,
      answersShown: true,
      questions: [],
      modules: [],
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Fractions' })).toBeTruthy();
    expect(screen.getByText('1 of 4')).toBeTruthy();
  });
});
