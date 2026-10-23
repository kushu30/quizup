import { emptyProctorCounts } from '@quizup/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { StudentResultPage } from './StudentResultPage';

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: { getStudentResult: vi.fn(), getSessionSummary: vi.fn(), getProctorTimeline: vi.fn() },
}));

const SESSION = '20000000-0000-4000-8000-000000000001';
const STUDENT = '30000000-0000-4000-8000-000000000001';

const result = {
  sessionId: SESSION,
  participantId: STUDENT,
  displayName: 'Asha',
  quizTitle: 'Midterm',
  mode: 'exam' as const,
  adaptive: false,
  score: 100,
  rank: 1,
  participantCount: 2,
  totalQuestions: 0,
  answered: 0,
  correct: 0,
  accuracy: null,
  timeTakenMs: 60_000,
  answersShown: true,
  questions: [],
  modules: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/sessions/${SESSION}/students/${STUDENT}`]}>
      <Routes>
        <Route
          path="/sessions/:sessionId/students/:participantId"
          element={<StudentResultPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StudentResultPage (host)', () => {
  it('shows the student result with proctoring signals and device', async () => {
    vi.mocked(api.getStudentResult).mockResolvedValue(result);
    vi.mocked(api.getSessionSummary).mockResolvedValue({
      participants: [
        {
          participantId: STUDENT,
          proctorCounts: { ...emptyProctorCounts(), tab_switch: 3 },
          devices: [],
        },
      ],
    } as never);
    vi.mocked(api.getProctorTimeline).mockResolvedValue([
      {
        participantId: STUDENT,
        displayName: 'Asha',
        attemptStartedAtMs: 1000,
        counts: emptyProctorCounts(),
        droppedEvents: 0,
        events: [
          {
            id: '40000000-0000-4000-8000-000000000001',
            participantId: STUDENT,
            attemptId: null,
            type: 'tab_switch',
            clientAt: 61_000,
            serverAt: 61_000,
            late: false,
            detail: null,
          },
        ],
      },
    ] as never);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Asha' })).toBeTruthy();
    expect(await screen.findByRole('table', { name: 'Proctor signal counts' })).toBeTruthy();
    const timeline = await screen.findByRole('list', { name: 'Proctor timeline' });
    expect(timeline.textContent).toContain('+1 min 0 s');
    expect(screen.getByText('No device recorded.')).toBeTruthy();
  });

  it('shows the server message when the result cannot be loaded', async () => {
    vi.mocked(api.getStudentResult).mockRejectedValue(new Error('Result not found'));
    vi.mocked(api.getSessionSummary).mockRejectedValue(new Error('x'));
    vi.mocked(api.getProctorTimeline).mockRejectedValue(new Error('x'));
    renderPage();
    expect(await screen.findByText('Result not found')).toBeTruthy();
  });

  it('marks an attempt that proctoring submitted automatically, with the count', async () => {
    vi.mocked(api.getStudentResult).mockResolvedValue(result);
    vi.mocked(api.getSessionSummary).mockResolvedValue({
      participants: [{ participantId: STUDENT, proctorCounts: emptyProctorCounts(), devices: [] }],
    } as never);
    vi.mocked(api.getProctorTimeline).mockResolvedValue([
      {
        participantId: STUDENT,
        displayName: 'Asha',
        attemptStartedAtMs: 1000,
        counts: emptyProctorCounts(),
        droppedEvents: 0,
        events: [
          {
            id: '40000000-0000-4000-8000-000000000002',
            participantId: STUDENT,
            attemptId: null,
            type: 'auto_submitted',
            clientAt: 90_000,
            serverAt: 90_000,
            late: false,
            detail: { count: 10, limit: 10 },
          },
        ],
      },
    ] as never);
    renderPage();
    const notice = await screen.findByText(/after 10 of 10 flags/);
    expect(notice.textContent).toContain('Auto-submitted by proctoring');
  });
});
