import { randomUUID } from 'node:crypto';
import type { MyResultRow, QuizSessionHistoryRow } from '@quizup/shared';
import { EXAM_CONSENT_VERSION } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from '../live/inMemoryRepository.js';
import { TEST_HOST, sleep, startLiveHarness } from '../live/liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function pool(): SeedQuestion[] {
  return Array.from({ length: 2 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    topic: 'Fractions',
  }));
}

describe('history', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  async function endLiveSession(quizId: string, studentToken?: string) {
    const summary = await harness.createSession(quizId, 5000);
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada', studentToken);
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await sleep(30);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(60);
    return { summary, student };
  }

  it('lists every session of a quiz for its host, current sessions first', async () => {
    harness = await startLiveHarness({ startDelayMs: 5 });
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    const { summary: ended, student } = await endLiveSession(quizId);
    await student.socket.emitWithAck('feedback:submit', { rating: 4 });
    const waiting = await harness.createSession(quizId, 5000);

    const response = await harness.request(`/quizzes/${quizId}/sessions`);
    expect(response.status).toBe(200);
    const rows = (await response.json()) as QuizSessionHistoryRow[];
    expect(rows.map((row) => row.sessionId)).toEqual([waiting.session.id, ended.session.id]);
    expect(rows[1]).toMatchObject({
      status: 'ended',
      mode: 'live',
      participantCount: 1,
      averageScore: 0,
      feedbackCount: 1,
      averageRating: 4,
    });
    expect(rows[0]).toMatchObject({ status: 'lobby', participantCount: 0, averageScore: null });
  });

  it('keeps quiz history private to its host', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    expect((await harness.request(`/quizzes/${quizId}/sessions`, 'other-host-token')).status).toBe(
      404,
    );
    expect((await harness.request(`/quizzes/${quizId}/sessions`, 'student-token')).status).toBe(
      403,
    );
  });

  it('shows signed-in students only their own results', async () => {
    harness = await startLiveHarness({ startDelayMs: 5 });
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      title: 'Fractions review',
      settings: { branding: { institutionName: 'Lincoln High' } },
      questions: pool(),
    });
    await endLiveSession(quizId, 'student-token');
    await endLiveSession(quizId);

    const response = await harness.request('/me/results', 'student-token');
    expect(response.status).toBe(200);
    const rows = (await response.json()) as MyResultRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      quizTitle: 'Fractions review',
      branding: { institutionName: 'Lincoln High' },
      score: 0,
      rank: 1,
      resultsHidden: false,
    });
    expect(await (await harness.request('/me/results', 'student-two-token')).json()).toEqual([]);
    expect((await harness.request('/me/results', 'none')).status).toBe(401);
  });

  it('hides a student exam score until the host releases results', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { mode: 'exam', durationMinutes: 20 },
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await ada.socket.emitWithAck('exam:start', { consentVersion: EXAM_CONSENT_VERSION });
    await ada.socket.emitWithAck('exam:submit', {});
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(60);

    const hidden = (await (
      await harness.request('/me/results', 'student-token')
    ).json()) as MyResultRow[];
    expect(hidden[0]).toMatchObject({ mode: 'exam', resultsHidden: true, score: null });

    await harness.request(`/sessions/${summary.session.id}/release-results`, 'host-token', 'POST');
    const shown = (await (
      await harness.request('/me/results', 'student-token')
    ).json()) as MyResultRow[];
    expect(shown[0]).toMatchObject({ resultsHidden: false, score: 0 });
  });
});

describe('quiz activity for the dashboard', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  it('gives each of the host quizzes its latest session and session count', async () => {
    harness = await startLiveHarness({ startDelayMs: 5 });
    const busy = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    const first = await harness.createSession(busy, 5000);
    await harness.hostRequest(`/sessions/${first.session.id}/start`);
    await sleep(30);
    await harness.hostRequest(`/sessions/${first.session.id}/end`);
    await sleep(30);
    const open = await harness.createSession(busy, 5000);

    const response = await harness.request('/me/quiz-activity');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        quizId: busy,
        sessionCount: 2,
        latest: {
          sessionId: open.session.id,
          joinCode: open.joinCode,
          status: 'lobby',
          startedAt: null,
          endedAt: null,
        },
      },
    ]);
  });

  it('shows nothing from other hosts and refuses students', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    await harness.createSession(quizId, 5000);
    expect(await (await harness.request('/me/quiz-activity', 'other-host-token')).json()).toEqual(
      [],
    );
    expect((await harness.request('/me/quiz-activity', 'student-token')).status).toBe(403);
  });
});
