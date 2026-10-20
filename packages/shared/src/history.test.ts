import { describe, expect, it } from 'vitest';
import { historyRowFromSession, myResultFromSession } from './history.js';
import type { Session } from './tables.js';

const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const ADA = '55555555-5555-4555-8555-555555555555';
const GRACE = '66666666-6666-4666-8666-666666666666';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    quiz_id: '11111111-1111-4111-8111-111111111111',
    join_code: 'K7M2QX',
    status: 'ended',
    started_at: '2026-10-19T09:00:00.000Z',
    ended_at: '2026-10-19T09:20:00.000Z',
    question_ids: [],
    exam_duration_minutes: null,
    results_released_at: null,
    ...overrides,
  };
}

const summary = {
  adaptive: true,
  participants: [
    { participantId: ADA, score: 900 },
    { participantId: GRACE, score: 600 },
  ],
  leaderboard: [
    { participantId: ADA, displayName: 'Ada', score: 900, rank: 1 },
    { participantId: GRACE, displayName: 'Grace', score: 600, rank: 2 },
  ],
};

describe('host history rows', () => {
  it('summarizes a finished session', () => {
    expect(
      historyRowFromSession({ session: session(), participantCount: 2, summary, ratings: [5, 4] }),
    ).toEqual({
      sessionId: SESSION_ID,
      joinCode: 'K7M2QX',
      status: 'ended',
      mode: 'live',
      adaptive: true,
      startedAt: '2026-10-19T09:00:00.000Z',
      endedAt: '2026-10-19T09:20:00.000Z',
      participantCount: 2,
      averageScore: 750,
      feedbackCount: 2,
      averageRating: 4.5,
    });
  });

  it('leaves averages empty when there is no stored summary or feedback', () => {
    const row = historyRowFromSession({
      session: session({
        status: 'lobby',
        started_at: null,
        ended_at: null,
        exam_duration_minutes: 30,
      }),
      participantCount: 0,
      summary: null,
      ratings: [],
    });
    expect(row).toMatchObject({
      mode: 'exam',
      adaptive: false,
      averageScore: null,
      averageRating: null,
    });
  });
});

describe('student result rows', () => {
  const base = {
    quizTitle: 'Fractions review',
    quizSettings: { branding: { institutionName: 'Lincoln High' } },
    participantCount: 2,
  };

  it('shows the student their own score and rank with the quiz brand', () => {
    expect(
      myResultFromSession({ ...base, session: session(), participantId: GRACE, summary }),
    ).toEqual({
      sessionId: SESSION_ID,
      quizTitle: 'Fractions review',
      branding: { institutionName: 'Lincoln High' },
      mode: 'live',
      adaptive: true,
      endedAt: '2026-10-19T09:20:00.000Z',
      score: 600,
      rank: 2,
      participantCount: 2,
      resultsHidden: false,
    });
  });

  it('hides exam scores until the host releases results', () => {
    const hidden = myResultFromSession({
      ...base,
      session: session({ exam_duration_minutes: 30 }),
      participantId: ADA,
      summary,
    });
    expect(hidden).toMatchObject({ mode: 'exam', resultsHidden: true, score: null, rank: null });
    const released = myResultFromSession({
      ...base,
      session: session({
        exam_duration_minutes: 30,
        results_released_at: '2026-10-19T10:00:00.000Z',
      }),
      participantId: ADA,
      summary,
    });
    expect(released).toMatchObject({ resultsHidden: false, score: 900, rank: 1 });
  });

  it('has no score while a session has no stored summary', () => {
    expect(
      myResultFromSession({
        ...base,
        session: session({ status: 'running' }),
        participantId: ADA,
        summary: null,
      }),
    ).toMatchObject({ score: null, rank: null, resultsHidden: false });
  });
});
