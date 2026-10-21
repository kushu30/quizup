import { describe, expect, it } from 'vitest';
import { buildStudentResult, studentResultSchema } from './studentResult.js';

const Q1 = '10000000-0000-4000-8000-000000000001';
const Q2 = '10000000-0000-4000-8000-000000000002';
const Q3 = '10000000-0000-4000-8000-000000000003';
const OPTIONS = ['A', 'B', 'C', 'D'];

const base = {
  sessionId: '20000000-0000-4000-8000-000000000001',
  participantId: '30000000-0000-4000-8000-000000000001',
  displayName: 'Asha',
  quizTitle: 'Fractions',
  mode: 'exam' as const,
  adaptive: false,
  score: 100,
  rank: 2,
  participantCount: 5,
  questionOrder: [Q2, Q1, Q3],
  questions: [
    { id: Q1, stem: 'One?', options: OPTIONS, topic: 'Module 1', correctIndex: 0 },
    { id: Q2, stem: 'Two?', options: OPTIONS, topic: 'Module 1', correctIndex: 1 },
    { id: Q3, stem: 'Three?', options: OPTIONS, topic: '', correctIndex: 2 },
  ],
  responses: [
    { questionId: Q1, chosenIndex: 0, correct: true, responseMs: 4000, points: 100 },
    { questionId: Q2, chosenIndex: 3, correct: false, responseMs: 9000, points: 0 },
  ],
  timeTakenMs: 600_000,
};

describe('buildStudentResult', () => {
  it('lists questions in the order the student met them and marks unanswered ones', () => {
    const result = buildStudentResult({ ...base, showCorrect: true });
    expect(result.questions.map((question) => question.questionId)).toEqual([Q2, Q1, Q3]);
    expect(result.questions[2]).toMatchObject({ chosenIndex: null, correct: null, points: 0 });
    expect(result.totalQuestions).toBe(3);
    expect(result.answered).toBe(2);
    expect(result.correct).toBe(1);
    expect(result.accuracy).toBe(0.5);
    expect(studentResultSchema.safeParse(result).success).toBe(true);
  });

  it('breaks accuracy down per module and groups an empty topic under Unsorted', () => {
    const result = buildStudentResult({ ...base, showCorrect: true });
    expect(result.modules).toEqual([
      { module: 'Module 1', total: 2, answered: 2, correct: 1, accuracy: 0.5 },
      { module: 'Unsorted', total: 1, answered: 0, correct: 0, accuracy: null },
    ]);
  });

  it('shows the correct option and per-question correctness when allowed', () => {
    const result = buildStudentResult({ ...base, showCorrect: true });
    expect(result.questions[0]).toMatchObject({ correct: false, correctIndex: 1, chosenIndex: 3 });
    expect(result.answersShown).toBe(true);
  });

  it('hides every hint about correctness when answers are not shown', () => {
    const result = buildStudentResult({ ...base, showCorrect: false });
    for (const question of result.questions) {
      expect(question.correct).toBeNull();
      expect(question.correctIndex).toBeNull();
    }
    expect(result.questions[0]?.chosenIndex).toBe(3);
    expect(result.correct).toBeNull();
    expect(result.accuracy).toBeNull();
    expect(result.modules).toEqual([]);
    expect(result.answersShown).toBe(false);
    expect(result.score).toBe(100);
    expect(result.answered).toBe(2);
    expect(JSON.stringify(result)).not.toContain('"correctIndex":1');
  });

  it('ignores responses to questions that are no longer part of the quiz', () => {
    const result = buildStudentResult({
      ...base,
      showCorrect: true,
      responses: [
        ...base.responses,
        {
          questionId: '99999999-0000-4000-8000-000000000009',
          chosenIndex: 0,
          correct: true,
          responseMs: 1,
          points: 100,
        },
      ],
    });
    expect(result.correct).toBe(1);
  });
});
