import { randomUUID } from 'node:crypto';
import { EXAM_CONSENT_VERSION, type StudentResult } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from '../live/inMemoryRepository.js';
import { TEST_HOST, sleep, startLiveHarness } from '../live/liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function pool(): SeedQuestion[] {
  return [
    {
      id: randomUUID(),
      stem: 'One?',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
      topic: 'Module 1',
    },
    {
      id: randomUUID(),
      stem: 'Two?',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 1,
      topic: 'Module 2',
    },
  ];
}

describe('per-student results', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  async function runExam(settings: Record<string, unknown> = {}, release = true) {
    harness = await startLiveHarness();
    const questions = pool();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      title: 'Midterm',
      settings: {
        mode: 'exam',
        durationMinutes: 20,
        shuffleQuestions: false,
        shuffleOptions: false,
        ...settings,
      },
      questions,
    });
    const summary = await harness.createSession(quizId, 5000);
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');
    const ben = await harness.joinAsStudent(summary.joinCode, 'Ben', 'student-two-token');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    for (const student of [ada, ben]) {
      await student.socket.emitWithAck('exam:start', { consentVersion: EXAM_CONSENT_VERSION });
    }
    const [first, second] = questions as [SeedQuestion, SeedQuestion];
    await ada.socket.emitWithAck('exam:answer', { questionId: first.id, displayedIndex: 0 });
    await ada.socket.emitWithAck('exam:answer', { questionId: second.id, displayedIndex: 3 });
    await ada.socket.emitWithAck('exam:submit', {});
    await ben.socket.emitWithAck('exam:answer', { questionId: first.id, displayedIndex: 0 });
    await ben.socket.emitWithAck('exam:submit', {});
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(60);
    if (release) {
      await harness.request(
        `/sessions/${summary.session.id}/release-results`,
        'host-token',
        'POST',
      );
    }
    return { sessionId: summary.session.id, ada, ben, questions };
  }

  it('gives the host a full result for one student, with correct answers', async () => {
    const { sessionId, ada } = await runExam();
    const response = await harness.request(
      `/sessions/${sessionId}/participants/${ada.participantId}/result`,
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as StudentResult;
    expect(result).toMatchObject({
      displayName: 'Ada',
      quizTitle: 'Midterm',
      mode: 'exam',
      participantCount: 2,
      totalQuestions: 2,
      answered: 2,
      correct: 1,
      answersShown: true,
    });
    expect(result.rank).toBeGreaterThanOrEqual(1);
    expect(result.timeTakenMs).not.toBeNull();
    expect(result.questions.map((question) => question.chosenIndex)).toEqual([0, 3]);
    expect(result.questions.map((question) => question.correct)).toEqual([true, false]);
    expect(result.questions.map((question) => question.correctIndex)).toEqual([0, 1]);
    expect(result.modules.map((entry) => [entry.module, entry.correct])).toEqual([
      ['Module 1', 1],
      ['Module 2', 0],
    ]);
  });

  it('keeps one student result private to the host who owns the quiz', async () => {
    const { sessionId, ada } = await runExam();
    const path = `/sessions/${sessionId}/participants/${ada.participantId}/result`;
    expect((await harness.request(path, 'other-host-token')).status).toBe(403);
    expect((await harness.request(path, 'student-token')).status).toBe(403);
    expect((await harness.request(path, 'none')).status).toBe(401);
    expect(
      (await harness.request(`/sessions/${sessionId}/participants/${randomUUID()}/result`)).status,
    ).toBe(404);
  });

  it('shows a student their own exam result without correct answers by default', async () => {
    const { sessionId } = await runExam();
    const response = await harness.request(`/me/results/${sessionId}`, 'student-token');
    expect(response.status).toBe(200);
    const result = (await response.json()) as StudentResult;
    expect(result).toMatchObject({ displayName: 'Ada', answered: 2, answersShown: false });
    expect(result.correct).toBeNull();
    expect(result.modules).toEqual([]);
    expect(result.questions.map((question) => question.chosenIndex)).toEqual([0, 3]);
    for (const question of result.questions) {
      expect(question.correct).toBeNull();
      expect(question.correctIndex).toBeNull();
    }
  });

  it('shows correct answers to the student when the quiz allows it', async () => {
    const { sessionId } = await runExam({ showCorrectAnswers: true });
    const result = (await (
      await harness.request(`/me/results/${sessionId}`, 'student-token')
    ).json()) as StudentResult;
    expect(result.answersShown).toBe(true);
    expect(result.questions.map((question) => question.correctIndex)).toEqual([0, 1]);
    expect(result.correct).toBe(1);
  });

  it('never returns another student their classmate result', async () => {
    const { sessionId } = await runExam();
    const ben = (await (
      await harness.request(`/me/results/${sessionId}`, 'student-two-token')
    ).json()) as StudentResult;
    expect(ben.displayName).toBe('Ben');
    expect(ben.answered).toBe(1);
    expect((await harness.request(`/me/results/${sessionId}`, 'none')).status).toBe(401);
    expect((await harness.request(`/me/results/${randomUUID()}`, 'student-token')).status).toBe(
      404,
    );
  });

  it('holds an exam result back until the host releases results', async () => {
    const { sessionId } = await runExam({}, false);
    const response = await harness.request(`/me/results/${sessionId}`, 'student-token');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'results_not_released' });
  });

  it('shows a live quiz student their answers with correctness by default', async () => {
    harness = await startLiveHarness({ startDelayMs: 5 });
    const questions = pool();
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions });
    const summary = await harness.createSession(quizId, 5000);
    await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await sleep(30);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(60);

    const result = (await (
      await harness.request(`/me/results/${summary.session.id}`, 'student-token')
    ).json()) as StudentResult;
    expect(result).toMatchObject({
      mode: 'live',
      answered: 0,
      totalQuestions: 2,
      answersShown: true,
    });
    expect(result.questions.every((question) => question.chosenIndex === null)).toBe(true);
    expect(result.questions.map((question) => question.correctIndex)).toEqual([0, 1]);
  });

  it('does not show a live session result before the session ends', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    const summary = await harness.createSession(quizId, 5000);
    await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');
    const response = await harness.request(`/me/results/${summary.session.id}`, 'student-token');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'session_not_finished' });
  });
});
