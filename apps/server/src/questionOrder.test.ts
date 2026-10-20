import { describe, expect, it } from 'vitest';
import { reorderQuestions, type OrderRepository } from './questionOrder.js';

function fakeRepository(options: { ownsQuiz?: boolean; applied?: boolean } = {}) {
  const calls: { quizId: string; ids: string[] }[] = [];
  const repository: OrderRepository = {
    ownsQuiz: async () => options.ownsQuiz ?? true,
    applyOrder: async (quizId, ids) => {
      calls.push({ quizId, ids });
      return options.applied ?? true;
    },
  };
  return { repository, calls };
}

describe('reorderQuestions', () => {
  it('saves the order for a quiz the host owns', async () => {
    const { repository, calls } = fakeRepository();
    expect(await reorderQuestions(repository, 'host', 'quiz', ['b', 'a'])).toBe('ok');
    expect(calls).toEqual([{ quizId: 'quiz', ids: ['b', 'a'] }]);
  });

  it('refuses a quiz that belongs to someone else without touching it', async () => {
    const { repository, calls } = fakeRepository({ ownsQuiz: false });
    expect(await reorderQuestions(repository, 'host', 'quiz', ['a'])).toBe('quiz_not_found');
    expect(calls).toEqual([]);
  });

  it('reports a list that does not match the quiz’s questions', async () => {
    const { repository } = fakeRepository({ applied: false });
    expect(await reorderQuestions(repository, 'host', 'quiz', ['a'])).toBe('invalid_order');
  });
});
