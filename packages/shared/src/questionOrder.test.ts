import { describe, expect, it } from 'vitest';
import { questionOrderSchema } from './api.js';
import { quizSettingsSchema } from './adaptive.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('questionOrderSchema', () => {
  it('takes a list of question ids', () => {
    expect(questionOrderSchema.parse({ questionIds: [A, B] })).toEqual({ questionIds: [A, B] });
  });

  it('refuses an empty list, a repeated id and a non-id', () => {
    expect(questionOrderSchema.safeParse({ questionIds: [] }).success).toBe(false);
    expect(questionOrderSchema.safeParse({ questionIds: [A, A] }).success).toBe(false);
    expect(questionOrderSchema.safeParse({ questionIds: ['x'] }).success).toBe(false);
  });
});

describe('shuffleQuestions setting', () => {
  it('is off unless the host turns it on', () => {
    expect(quizSettingsSchema.parse({}).shuffleQuestions).toBe(false);
    expect(quizSettingsSchema.parse({ shuffleQuestions: true }).shuffleQuestions).toBe(true);
  });

  it('is ignored for adaptive quizzes, which pick questions by rating', () => {
    expect(
      quizSettingsSchema.parse({ adaptive: true, shuffleQuestions: true }).shuffleQuestions,
    ).toBe(false);
  });
});
