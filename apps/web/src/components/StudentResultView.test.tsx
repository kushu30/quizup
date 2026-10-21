import type { StudentResult } from '@quizup/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudentResultView } from './StudentResultView';

const Q1 = '10000000-0000-4000-8000-000000000001';
const Q2 = '10000000-0000-4000-8000-000000000002';

const shown: StudentResult = {
  sessionId: '20000000-0000-4000-8000-000000000001',
  participantId: '30000000-0000-4000-8000-000000000001',
  displayName: 'Asha',
  quizTitle: 'Fractions',
  mode: 'exam',
  adaptive: false,
  score: 100,
  rank: 2,
  participantCount: 5,
  totalQuestions: 2,
  answered: 2,
  correct: 1,
  accuracy: 0.5,
  timeTakenMs: 125_000,
  answersShown: true,
  questions: [
    {
      questionId: Q1,
      stem: 'One plus one?',
      module: 'Module 1',
      options: ['2', '3', '4', '5'],
      chosenIndex: 0,
      correct: true,
      correctIndex: 0,
      responseMs: 4000,
      points: 100,
    },
    {
      questionId: Q2,
      stem: 'Two plus two?',
      module: 'Module 2',
      options: ['3', '4', '5', '6'],
      chosenIndex: 2,
      correct: false,
      correctIndex: 1,
      responseMs: 9000,
      points: 0,
    },
  ],
  modules: [
    { module: 'Module 1', total: 1, answered: 1, correct: 1, accuracy: 1 },
    { module: 'Module 2', total: 1, answered: 1, correct: 0, accuracy: 0 },
  ],
};

afterEach(cleanup);

describe('StudentResultView', () => {
  it('shows the headline numbers, modules and each answer with its correctness', () => {
    render(<StudentResultView result={shown} audience="student" />);
    expect(screen.getByText('2 of 5')).toBeTruthy();
    expect(screen.getByText('2 min 5 s')).toBeTruthy();
    expect(screen.getByText('1 of 2 (50%)')).toBeTruthy();
    const modules = screen.getByRole('table', { name: 'Accuracy by module' });
    expect(within(modules).getByText('Module 2')).toBeTruthy();
    expect(screen.getAllByText('Correct answer')).toHaveLength(2);
    expect(screen.getByText('Incorrect')).toBeTruthy();
    expect(screen.getAllByText('Your answer')).toHaveLength(2);
  });

  it('says the host hides correct answers, and shows none', () => {
    const hidden: StudentResult = {
      ...shown,
      answersShown: false,
      correct: null,
      accuracy: null,
      modules: [],
      questions: shown.questions.map((question) => ({
        ...question,
        correct: null,
        correctIndex: null,
      })),
    };
    render(<StudentResultView result={hidden} audience="student" />);
    expect(screen.getByText(/chosen not to show which answers were right/)).toBeTruthy();
    expect(screen.queryByText('Correct answer')).toBeNull();
    expect(screen.queryByText('Incorrect')).toBeNull();
    expect(screen.queryByRole('table', { name: 'Accuracy by module' })).toBeNull();
    expect(screen.getByText('Answered')).toBeTruthy();
  });

  it('marks unanswered questions and speaks about "Chosen" for hosts', () => {
    const skipped: StudentResult = {
      ...shown,
      questions: [{ ...shown.questions[0]!, chosenIndex: null, correct: null, responseMs: null }],
    };
    render(<StudentResultView result={skipped} audience="host" />);
    expect(screen.getByText('Not answered')).toBeTruthy();
    render(<StudentResultView result={shown} audience="host" />);
    expect(screen.getAllByText('Chosen').length).toBeGreaterThan(0);
  });
});
