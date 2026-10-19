import type { Question } from '@quizup/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { QuestionBank } from './QuestionBank';

vi.mock('../lib/api', () => ({
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: {
    listQuestions: vi.fn(),
    listTopics: vi.fn(),
    approveQuestion: vi.fn(),
    unapproveQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
    updateQuestion: vi.fn(),
  },
}));

const pending: Question = {
  id: '33333333-3333-4333-8333-333333333333',
  quiz_id: '11111111-1111-4111-8111-111111111111',
  topic: 'Fractions',
  stem: 'What is one half of 8?',
  options: ['4', '2', '6', '8'],
  correct_index: 0,
  difficulty: 'easy',
  elo_rating: 1000,
  source: 'llm',
  approved: false,
};

beforeEach(() => {
  vi.mocked(api.listQuestions).mockResolvedValue([pending]);
  vi.mocked(api.listTopics).mockResolvedValue(['Fractions', 'Decimals']);
  vi.mocked(api.approveQuestion).mockResolvedValue({ ...pending, approved: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuestionBank', () => {
  it('labels every filter control', async () => {
    render(<QuestionBank />);
    await screen.findByText('What is one half of 8?');
    expect(screen.getByLabelText('Search').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Topic').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Difficulty').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Status').tagName).toBe('SELECT');
  });

  it('hides the status filter when the list is locked to one status', async () => {
    render(<QuestionBank lockedApproval="pending" />);
    await screen.findByText('What is one half of 8?');
    expect(screen.queryByLabelText('Status')).toBeNull();
  });

  it('marks the correct option and flags AI drafts awaiting review', async () => {
    render(<QuestionBank />);
    const correct = await screen.findByText(/^4/);
    expect(correct.closest('li')?.textContent).toContain('Correct');
    expect(screen.getByText('AI generated')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('approves a question and tells the parent', async () => {
    const onChanged = vi.fn();
    render(<QuestionBank onChanged={onChanged} />);
    await screen.findByText('What is one half of 8?');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(api.approveQuestion).toHaveBeenCalledWith(pending.id);
  });
});
