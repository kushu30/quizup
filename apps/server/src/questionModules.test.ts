import { describe, expect, it } from 'vitest';
import { moveQuestionsToModule, type ModuleRepository } from './questionModules.js';

function fakeRepository(owned: string[]) {
  const calls: { quizIds: string[]; questionIds: string[]; topic: string }[] = [];
  const repository: ModuleRepository = {
    listOwnedQuizIds: async () => owned,
    moveQuestions: async (quizIds, questionIds, topic) => {
      calls.push({ quizIds, questionIds, topic });
      return questionIds.length;
    },
  };
  return { repository, calls };
}

describe('moveQuestionsToModule', () => {
  it('moves the questions and only looks inside the host’s own quizzes', async () => {
    const { repository, calls } = fakeRepository(['quiz-a', 'quiz-b']);
    const moved = await moveQuestionsToModule(repository, 'host-1', ['q1', 'q2'], 'Module 2');
    expect(moved).toBe(2);
    expect(calls).toEqual([
      { quizIds: ['quiz-a', 'quiz-b'], questionIds: ['q1', 'q2'], topic: 'Module 2' },
    ]);
  });

  it('moves nothing, without touching questions, when the host has no quizzes', async () => {
    const { repository, calls } = fakeRepository([]);
    expect(await moveQuestionsToModule(repository, 'host-1', ['q1'], 'Module 2')).toBe(0);
    expect(calls).toEqual([]);
  });
});
