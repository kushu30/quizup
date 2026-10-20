import { randomUUID } from 'node:crypto';
import { createSeededRandom, type AnalyticsSnapshot } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from './inMemoryRepository.js';
import { TEST_HOST, sleep, startLiveHarness } from './liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function algebraPool(count = 3): SeedQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    stem: `Algebra ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: index % 4,
    topic: 'Algebra',
    difficulty: 'medium',
  }));
}

describe('question evidence', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  it('no longer offers the retired learner profile endpoint', async () => {
    harness = await startLiveHarness();
    expect((await harness.request('/me/learner-profile', 'student-token', 'DELETE')).status).toBe(
      404,
    );
  });

  async function answerSingleQuestion(answersCount: number) {
    harness = await startLiveHarness({ random: createSeededRandom(3) });
    const question = { ...algebraPool(1)[0], answersCount } as SeedQuestion;
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: [question] });
    const summary = await harness.createSession(quizId, 400);
    const hostSocket = await harness.joinAsHost(summary.session.id);
    const snapshots = harness.collectEvents(hostSocket, 'analytics:snapshot');
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada');

    const shownPromise = harness.nextEvent(student.socket, 'question:show');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await shownPromise;
    await harness.waitUntil(shown.startsAtServerMs);
    await student.socket.emitWithAck('answer:submit', {
      questionId: shown.questionId,
      chosenIndex: question.correctIndex,
    });
    await sleep(150);
    await harness.engine.settlePersistence();
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(80);
    const before = snapshots.find((snapshot) => snapshot.questions.length > 0) as AnalyticsSnapshot;
    const final = snapshots[snapshots.length - 1] as AnalyticsSnapshot;
    return { quizId, question, before: before.questions[0], final: final.questions[0] };
  }

  it('flags a question with 29 responses as provisional and clears the flag when it reaches 30', async () => {
    const { before, final, question, quizId } = await answerSingleQuestion(29);
    expect(before).toMatchObject({ ratingAnswers: 29, provisional: true });
    expect(final).toMatchObject({ ratingAnswers: 30, provisional: false });
    expect(
      harness.repository.quizzes
        .get(quizId)
        ?.questions.find((candidate) => candidate.id === question.id)?.answersCount,
    ).toBe(30);
  });

  it('keeps a question with few responses provisional and counts every answer once', async () => {
    const { before, final } = await answerSingleQuestion(5);
    expect(before).toMatchObject({ ratingAnswers: 5, provisional: true });
    expect(final).toMatchObject({ ratingAnswers: 6, provisional: true });
  });
});
