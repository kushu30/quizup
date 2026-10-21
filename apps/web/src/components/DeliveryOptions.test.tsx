import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeliveryOptions } from './DeliveryOptions';

afterEach(cleanup);

const MODULES = [
  { name: 'Module 1', count: 6 },
  { name: 'Module 2', count: 4 },
  { name: 'Unsorted', count: 1 },
];

function setup(overrides: Partial<Parameters<typeof DeliveryOptions>[0]> = {}) {
  const props = {
    assessmentType: 'live' as const,
    shuffleQuestions: false,
    shuffleOptions: false,
    pools: [] as { module: string; count: number }[],
    modules: MODULES,
    onShuffleQuestionsChange: vi.fn(),
    onShuffleOptionsChange: vi.fn(),
    onPoolsChange: vi.fn(),
    ...overrides,
  };
  render(<DeliveryOptions {...props} />);
  return props;
}

describe('DeliveryOptions shuffling', () => {
  it('offers only question shuffling for a live quiz, and explains each state', () => {
    setup();
    expect(screen.getByLabelText('Shuffle question order')).toBeTruthy();
    expect(screen.queryByLabelText('Shuffle answer options')).toBeNull();
    expect(
      screen.getByText(/Off: students get the questions in the order shown below/),
    ).toBeTruthy();
    cleanup();
    setup({ shuffleQuestions: true });
    expect(
      screen.getByText(/On: each session mixes the questions into a new random order/),
    ).toBeTruthy();
  });

  it('offers both shuffles for an exam, described per student', () => {
    setup({ assessmentType: 'exam', shuffleQuestions: true, shuffleOptions: true });
    expect(
      screen.getByText(/On: every student gets the questions in their own random order/),
    ).toBeTruthy();
    expect(screen.getByText(/On: every student sees the answers in their own order/)).toBeTruthy();
  });

  it('reports a change to either switch', () => {
    const props = setup({ assessmentType: 'exam' });
    fireEvent.click(screen.getByLabelText('Shuffle question order'));
    fireEvent.click(screen.getByLabelText('Shuffle answer options'));
    expect(props.onShuffleQuestionsChange).toHaveBeenCalledWith(true);
    expect(props.onShuffleOptionsChange).toHaveBeenCalledWith(true);
  });
});

describe('DeliveryOptions pools', () => {
  it('explains pools and starts with none', () => {
    setup();
    expect(screen.getByText(/random selection from a module/i)).toBeTruthy();
    expect(screen.queryByText(/Each student gets/)).toBeNull();
  });

  it('adds a rule for the first module that has none, drawing one question', () => {
    const props = setup({ pools: [{ module: 'Module 1', count: 2 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Add a pool rule' }));
    expect(props.onPoolsChange).toHaveBeenCalledWith([
      { module: 'Module 1', count: 2 },
      { module: 'Module 2', count: 1 },
    ]);
  });

  it('cannot add a rule when there are no modules or every module has one', () => {
    setup({ modules: [] });
    expect(
      (screen.getByRole('button', { name: 'Add a pool rule' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    cleanup();
    setup({
      pools: MODULES.map((module) => ({ module: module.name, count: 1 })),
    });
    expect(
      (screen.getByRole('button', { name: 'Add a pool rule' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows each rule with how many questions its module has, and edits the count', () => {
    const props = setup({ pools: [{ module: 'Module 1', count: 2 }] });
    const rule = screen.getByRole('group', { name: 'Pool rule for Module 1' });
    expect(within(rule).getByText('of 6 approved questions')).toBeTruthy();
    fireEvent.change(within(rule).getByLabelText('Questions to draw from Module 1'), {
      target: { value: '4' },
    });
    expect(props.onPoolsChange).toHaveBeenCalledWith([{ module: 'Module 1', count: 4 }]);
  });

  it('ignores a count that is not a whole number of at least one', () => {
    const props = setup({ pools: [{ module: 'Module 1', count: 2 }] });
    const field = screen.getByLabelText('Questions to draw from Module 1');
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.change(field, { target: { value: '' } });
    expect(props.onPoolsChange).not.toHaveBeenCalled();
  });

  it('removes a rule', () => {
    const props = setup({
      pools: [
        { module: 'Module 1', count: 2 },
        { module: 'Module 2', count: 1 },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove the rule for Module 1' }));
    expect(props.onPoolsChange).toHaveBeenCalledWith([{ module: 'Module 2', count: 1 }]);
  });

  it('tells the host how many questions each student will get', () => {
    setup({ pools: [{ module: 'Module 1', count: 2 }] });
    expect(screen.getByText('Each student gets 7 of 11 questions.')).toBeTruthy();
    expect(screen.getByText(/The other 5 are always included/)).toBeTruthy();
  });

  it('warns when a rule asks for more than the module has', () => {
    setup({ pools: [{ module: 'Module 2', count: 9 }] });
    expect(
      screen.getByText(/Module 2 has only 4 approved questions, so all 4 are used/),
    ).toBeTruthy();
    expect(screen.getByText('Each student gets 11 of 11 questions.')).toBeTruthy();
  });

  it('marks a rule whose module no longer has questions', () => {
    setup({ pools: [{ module: 'Gone', count: 2 }] });
    expect(
      screen.getByText(/Gone has no approved questions, so this rule does nothing/),
    ).toBeTruthy();
  });
});
