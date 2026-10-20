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
    moveQuestions: vi.fn(),
    reorderQuestions: vi.fn(),
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
  position: 1,
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
    expect(screen.getByRole('combobox', { name: 'Module' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Difficulty' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeTruthy();
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

  describe('modules', () => {
    const decimal: Question = {
      ...pending,
      id: '44444444-4444-4444-8444-444444444444',
      topic: 'Decimals',
      stem: 'What is 0.5 + 0.25?',
      source: 'manual',
      approved: true,
    };

    it('groups questions under a heading for each module', async () => {
      vi.mocked(api.listQuestions).mockResolvedValue([decimal, pending]);
      render(<QuestionBank />);
      await screen.findByText('What is 0.5 + 0.25?');
      const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
      expect(headings).toEqual(['Decimals (1)', 'Fractions (1)']);
    });

    it('moves the ticked questions to a module and reloads', async () => {
      vi.mocked(api.listQuestions).mockResolvedValue([decimal, pending]);
      vi.mocked(api.moveQuestions).mockResolvedValue({ moved: 2 });
      const onChanged = vi.fn();
      render(<QuestionBank onChanged={onChanged} />);
      await screen.findByText('What is 0.5 + 0.25?');
      expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select What is 0.5 + 0.25?' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select What is one half of 8?' }));
      expect(screen.getByText('2 selected')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Move' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      fireEvent.change(screen.getByLabelText('Move to module'), { target: { value: 'Module 2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Move' }));
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(api.moveQuestions).toHaveBeenCalledWith([decimal.id, pending.id], 'Module 2');
      expect(screen.queryByText('2 selected')).toBeNull();
    });

    it('selects every question in a module with one tick', async () => {
      vi.mocked(api.listQuestions).mockResolvedValue([decimal, pending]);
      render(<QuestionBank />);
      await screen.findByText('What is 0.5 + 0.25?');
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select all in Fractions' }));
      expect(screen.getByText('1 selected')).toBeTruthy();
    });

    it('does not move anything without a module name', async () => {
      render(<QuestionBank />);
      await screen.findByText('What is one half of 8?');
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select What is one half of 8?' }));
      expect((screen.getByRole('button', { name: 'Move' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(api.moveQuestions).not.toHaveBeenCalled();
    });
  });

  describe('ordering inside a quiz', () => {
    const QUIZ = '11111111-1111-4111-8111-111111111111';
    const first: Question = {
      ...pending,
      id: 'a1',
      stem: 'First question',
      approved: true,
      position: 1,
    };
    const second: Question = {
      ...pending,
      id: 'b2',
      stem: 'Second question',
      approved: true,
      position: 2,
      topic: 'Decimals',
    };
    const third: Question = {
      ...pending,
      id: 'c3',
      stem: 'Third question',
      approved: true,
      position: 3,
    };

    function renderOrdered() {
      vi.mocked(api.listQuestions).mockResolvedValue([first, second, third]);
      vi.mocked(api.reorderQuestions).mockResolvedValue(undefined);
      return render(<QuestionBank quizId={QUIZ} lockedApproval="approved" ordered />);
    }

    function stems() {
      return screen
        .getAllByRole('listitem', { name: /question$/ })
        .map((item) => item.getAttribute('aria-label'));
    }

    it('shows one numbered list in the host’s order, with each question’s module', async () => {
      renderOrdered();
      await screen.findByText('First question');
      expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([]);
      expect(stems()).toEqual(['First question', 'Second question', 'Third question']);
      expect(screen.getByText('Decimals')).toBeTruthy();
      expect(screen.getByText('1.')).toBeTruthy();
    });

    it('moves a question down and saves the new order', async () => {
      renderOrdered();
      await screen.findByText('First question');
      fireEvent.click(screen.getByRole('button', { name: 'Move First question down' }));
      await waitFor(() =>
        expect(api.reorderQuestions).toHaveBeenCalledWith(QUIZ, ['b2', 'a1', 'c3']),
      );
      expect(stems()).toEqual(['Second question', 'First question', 'Third question']);
    });

    it('moves a question up', async () => {
      renderOrdered();
      await screen.findByText('Third question');
      fireEvent.click(screen.getByRole('button', { name: 'Move Third question up' }));
      await waitFor(() =>
        expect(api.reorderQuestions).toHaveBeenCalledWith(QUIZ, ['a1', 'c3', 'b2']),
      );
    });

    it('cannot move the first question up or the last one down', async () => {
      renderOrdered();
      await screen.findByText('First question');
      expect(
        (screen.getByRole('button', { name: 'Move First question up' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(
        (screen.getByRole('button', { name: 'Move Third question down' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it('reorders by dragging a question onto another', async () => {
      renderOrdered();
      await screen.findByText('First question');
      const items = screen.getAllByRole('listitem', { name: /question$/ });
      fireEvent.dragStart(items[2] as HTMLElement);
      fireEvent.dragOver(items[0] as HTMLElement);
      fireEvent.drop(items[0] as HTMLElement);
      await waitFor(() =>
        expect(api.reorderQuestions).toHaveBeenCalledWith(QUIZ, ['c3', 'a1', 'b2']),
      );
    });

    it('turns reordering off while a filter is active and says why', async () => {
      renderOrdered();
      await screen.findByText('First question');
      fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'second' } });
      await waitFor(() =>
        expect(screen.getByText(/Clear the search and filters to change the order/)).toBeTruthy(),
      );
      expect(screen.queryByRole('button', { name: /Move .* down/ })).toBeNull();
    });

    it('puts the list back and says so when saving the order fails', async () => {
      renderOrdered();
      vi.mocked(api.reorderQuestions).mockRejectedValue(new Error('Could not save the order'));
      await screen.findByText('First question');
      fireEvent.click(screen.getByRole('button', { name: 'Move First question down' }));
      expect(await screen.findByText('Could not save the order')).toBeTruthy();
      await waitFor(() =>
        expect(stems()).toEqual(['First question', 'Second question', 'Third question']),
      );
    });

    it('offers no ordering controls in the module view or for pending questions', async () => {
      vi.mocked(api.listQuestions).mockResolvedValue([first, second]);
      const { unmount } = render(<QuestionBank quizId={QUIZ} lockedApproval="pending" ordered />);
      await screen.findAllByText('First question');
      expect(screen.queryByRole('button', { name: /Move .* down/ })).toBeNull();
      unmount();
      render(<QuestionBank />);
      await screen.findByText('First question');
      expect(screen.queryByRole('button', { name: /Move .* down/ })).toBeNull();
    });
  });

  it('shows a small picture with its description on a question that has an image', async () => {
    vi.mocked(api.listQuestions).mockResolvedValue([
      { ...pending, image_url: 'https://x.test/a.png', image_alt: 'A cat on a sofa' },
    ]);
    render(<QuestionBank />);
    const image = await screen.findByRole('img', { name: 'A cat on a sofa' });
    expect(image.getAttribute('src')).toBe('https://x.test/a.png');
  });
});
