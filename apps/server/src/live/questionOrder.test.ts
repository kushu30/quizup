import { randomUUID } from 'node:crypto';
import { createSeededRandom } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_HOST, startLiveHarness } from './liveHarness.testkit.js';
import type { SeedQuestion } from './inMemoryRepository.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function pool(size: number): SeedQuestion[] {
  return Array.from({ length: size }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index + 1}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
  }));
}

describe('the order of questions in a session', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  async function orderFor(settings: unknown, questions: SeedQuestion[]) {
    harness = await startLiveHarness({ random: createSeededRandom(3) });
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, settings, questions });
    const summary = await harness.createSession(quizId, 1000);
    return harness.repository.sessions.get(summary.session.id)?.session.question_ids;
  }

  it('follows the host’s order unless shuffling is turned on', async () => {
    const questions = pool(12);
    expect(await orderFor({}, questions)).toEqual(questions.map((question) => question.id));
  });

  it('shuffles the questions when the quiz says so', async () => {
    const questions = pool(12);
    const ids = questions.map((question) => question.id);
    const order = await orderFor({ shuffleQuestions: true }, questions);
    expect([...(order ?? [])].sort()).toEqual([...ids].sort());
    expect(order).not.toEqual(ids);
  });

  it('keeps the host’s order for a quiz saved before the setting existed', async () => {
    const questions = pool(5);
    expect(await orderFor({ mode: 'live', adaptive: false }, questions)).toEqual(
      questions.map((question) => question.id),
    );
  });

  describe('question pools in a live session', () => {
    function twoModules(): SeedQuestion[] {
      return [
        ...[1, 2, 3, 4, 5, 6].map(
          (n) => ({ ...pool(1)[0], stem: `A${n}`, topic: 'Module A' }) as SeedQuestion,
        ),
        ...[1, 2].map((n) => ({ ...pool(1)[0], stem: `B${n}`, topic: 'Module B' }) as SeedQuestion),
      ].map((question, index) => ({
        ...question,
        id: randomUUID(),
        stem: question.stem + String(index),
      }));
    }

    it('draws the asked number from a module and keeps the other modules whole', async () => {
      const questions = twoModules();
      const order = await orderFor({ pools: [{ module: 'Module A', count: 2 }] }, questions);
      const byId = new Map(questions.map((question) => [question.id, question]));
      const topics = (order ?? []).map((id) => byId.get(id)?.topic);
      expect(topics.filter((topic) => topic === 'Module A')).toHaveLength(2);
      expect(topics.filter((topic) => topic === 'Module B')).toHaveLength(2);
    });

    it('keeps the host’s order among the drawn questions when shuffling is off', async () => {
      const questions = twoModules();
      const order = await orderFor({ pools: [{ module: 'Module A', count: 3 }] }, questions);
      const position = new Map(questions.map((question, index) => [question.id, index]));
      const positions = (order ?? []).map((id) => position.get(id) ?? -1);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('lets an exam keep every question as a candidate and leaves the draw to each attempt', async () => {
      const questions = twoModules();
      const order = await orderFor(
        { mode: 'exam', durationMinutes: 10, pools: [{ module: 'Module A', count: 2 }] },
        questions,
      );
      expect(order).toEqual(questions.map((question) => question.id));
    });
  });
});
