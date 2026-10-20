import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackForm } from './FeedbackForm';

afterEach(cleanup);

function renderForm(result: { ok: true } | { ok: false; error: string } = { ok: true }) {
  let resolve: (value: typeof result) => void = () => undefined;
  const submit = vi.fn(
    () =>
      new Promise<typeof result>((done) => {
        resolve = done;
      }),
  );
  render(<FeedbackForm submit={submit} />);
  return { submit, finish: () => act(async () => resolve(result)) };
}

describe('FeedbackForm', () => {
  it('asks for a rating before sending', () => {
    const { submit } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(screen.getByText('Choose a rating from 1 to 5.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('offers five labelled ratings', () => {
    renderForm();
    const group = screen.getByRole('radiogroup', { name: 'How was this assessment?' });
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '5 out of 5, excellent' })).toBeTruthy();
  });

  it('sends the rating and comment once and then thanks the student', async () => {
    const { submit, finish } = renderForm();
    fireEvent.click(screen.getByRole('radio', { name: '4 out of 5, good' }));
    fireEvent.change(screen.getByLabelText('What went well or was hard? (optional)'), {
      target: { value: 'Question 3 was tricky' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sending...' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({ rating: 4, comment: 'Question 3 was tricky' });
    await finish();
    expect(screen.getByRole('status').textContent).toBe('Thanks for your feedback.');
    expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull();
  });

  it('lets the student try again when sending fails', async () => {
    const { finish } = renderForm({ ok: false, error: 'server_error' });
    fireEvent.click(screen.getByRole('radio', { name: '2 out of 5, poor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    await finish();
    expect(screen.getByRole('alert').textContent).toMatch(/could not be sent/);
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeTruthy();
  });
});
