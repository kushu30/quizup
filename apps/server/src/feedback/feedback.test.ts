import { randomUUID } from 'node:crypto';
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

describe('session feedback', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  async function liveSession() {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    const summary = await harness.createSession(quizId, 5000);
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada');
    const grace = await harness.joinAsStudent(summary.joinCode, 'Grace');
    return { summary, ada, grace };
  }

  it('refuses feedback while a live quiz is still going', async () => {
    const { ada } = await liveSession();
    expect(await ada.socket.emitWithAck('feedback:submit', { rating: 5 })).toEqual({
      ok: false,
      error: 'feedback_not_open',
    });
    expect(harness.repository.sessionFeedback).toHaveLength(0);
  });

  it('accepts feedback after the quiz ends and keeps one answer per student', async () => {
    const { summary, ada, grace } = await liveSession();
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(50);
    expect(
      await ada.socket.emitWithAck('feedback:submit', { rating: 2, comment: 'Too fast' }),
    ).toEqual({
      ok: true,
    });
    expect(await ada.socket.emitWithAck('feedback:submit', { rating: 4 })).toEqual({ ok: true });
    expect(
      await grace.socket.emitWithAck('feedback:submit', { rating: 5, comment: 'Fun' }),
    ).toEqual({
      ok: true,
    });
    expect(harness.repository.sessionFeedback).toHaveLength(2);
    expect(
      harness.repository.sessionFeedback.find((row) => row.participantId === ada.participantId),
    ).toMatchObject({ rating: 4, comment: null });
  });

  it('rejects ratings outside 1 to 5', async () => {
    const { summary, ada } = await liveSession();
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(50);
    expect(await ada.socket.emitWithAck('feedback:submit', { rating: 9 })).toEqual({
      ok: false,
      error: 'invalid_payload',
    });
  });

  it('lets an exam student give feedback once their own attempt is submitted', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { mode: 'exam', durationMinutes: 20 },
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await ada.socket.emitWithAck('exam:start', { consentVersion: EXAM_CONSENT_VERSION });
    expect(await ada.socket.emitWithAck('feedback:submit', { rating: 3 })).toEqual({
      ok: false,
      error: 'feedback_not_open',
    });
    await ada.socket.emitWithAck('exam:submit', {});
    expect(await ada.socket.emitWithAck('feedback:submit', { rating: 3 })).toEqual({ ok: true });
  });

  it('shows the feedback to the session host only', async () => {
    const { summary, ada, grace } = await liveSession();
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(50);
    await ada.socket.emitWithAck('feedback:submit', { rating: 4, comment: 'Clear questions' });
    await grace.socket.emitWithAck('feedback:submit', { rating: 5 });

    const response = await harness.request(`/sessions/${summary.session.id}/feedback`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { count: number; items: unknown[] };
    expect(body).toMatchObject({ count: 2, averageRating: 4.5 });
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'Ada', rating: 4, comment: 'Clear questions' }),
        expect.objectContaining({ displayName: 'Grace', rating: 5, comment: null }),
      ]),
    );
    expect(
      (await harness.request(`/sessions/${summary.session.id}/feedback`, 'other-host-token'))
        .status,
    ).toBe(404);
    expect(
      (await harness.request(`/sessions/${summary.session.id}/feedback`, 'student-token')).status,
    ).toBe(403);
  });
});
