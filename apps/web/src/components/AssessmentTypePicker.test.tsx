import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssessmentTypePicker } from './AssessmentTypePicker';

afterEach(cleanup);

function renderPicker(value: 'live' | 'adaptive' | 'exam' = 'live') {
  const onChange = vi.fn();
  const onDurationChange = vi.fn();
  render(
    <AssessmentTypePicker
      value={value}
      onChange={onChange}
      durationMinutes="30"
      onDurationChange={onDurationChange}
    />,
  );
  return { onChange, onDurationChange };
}

describe('AssessmentTypePicker', () => {
  it('offers the three assessment types as one choice', () => {
    renderPicker('adaptive');
    const group = screen.getByRole('radiogroup', { name: 'Assessment type' });
    expect(group).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Adaptive quiz/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('reports the chosen type', () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole('radio', { name: /Timed exam/ }));
    expect(onChange).toHaveBeenCalledWith('exam');
  });

  it('explains adaptive quizzes in a hover tooltip, not a button that opens a box', () => {
    renderPicker();
    const info = screen.getByLabelText('How adaptive quizzes work');
    expect(info.tagName).not.toBe('BUTTON');
    expect(info.getAttribute('aria-expanded')).toBeNull();
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    expect(tooltip.textContent).toContain('rating goes up');
    expect(info.getAttribute('aria-describedby')).toBe(tooltip.id);
    fireEvent.click(info);
    expect(screen.getAllByText(/rating goes up/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'How adaptive quizzes work' })).toBeNull();
  });

  it('asks for the exam length only for timed exams', () => {
    renderPicker('live');
    expect(screen.queryByLabelText('Exam length in minutes')).toBeNull();
    cleanup();
    const { onDurationChange } = renderPicker('exam');
    fireEvent.change(screen.getByLabelText('Exam length in minutes'), { target: { value: '45' } });
    expect(onDurationChange).toHaveBeenCalledWith('45');
  });
});
