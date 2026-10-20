import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultsOptions } from './ResultsOptions';

afterEach(cleanup);

describe('ResultsOptions', () => {
  it('explains what turning correct answers off means for an exam', () => {
    render(<ResultsOptions assessmentType="exam" showCorrectAnswers={false} onChange={vi.fn()} />);
    expect(screen.getByText(/protects exam questions you reuse/)).toBeTruthy();
  });

  it('reports the switch', () => {
    const onChange = vi.fn();
    render(<ResultsOptions assessmentType="live" showCorrectAnswers={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show correct answers to students' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
