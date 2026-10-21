import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionForm } from './QuestionForm';

afterEach(cleanup);

function fill() {
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'What is 1 + 1?' } });
  ['1', '2', '3', '4'].forEach((text, index) => {
    fireEvent.change(screen.getByLabelText(`Option ${'ABCD'[index]}`), { target: { value: text } });
  });
}

describe('QuestionForm module field', () => {
  it('asks for an optional module, not a required topic', () => {
    render(<QuestionForm submitLabel="Add question" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Module (optional)')).toBeTruthy();
    expect(screen.queryByLabelText('Topic')).toBeNull();
    expect(screen.getByText(/Leave it empty to file the question under Unsorted/)).toBeTruthy();
  });

  it('saves a question with no module under Unsorted', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<QuestionForm submitLabel="Add question" onSubmit={onSubmit} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ topic: 'Unsorted' }));
  });

  it('suggests the modules that already exist', () => {
    const { container } = render(
      <QuestionForm
        submitLabel="Add question"
        modules={['Module 1', 'Module 2']}
        onSubmit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Module (optional)');
    const list = container.ownerDocument.getElementById(input.getAttribute('list') ?? '');
    expect(Array.from(list?.querySelectorAll('option') ?? []).map((o) => o.value)).toEqual([
      'Module 1',
      'Module 2',
    ]);
  });

  it('keeps the module after adding a question so the next one lands in the same place', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<QuestionForm submitLabel="Add question" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Module (optional)'), { target: { value: 'Module 3' } });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByLabelText('Question') as HTMLTextAreaElement).value).toBe(''),
    );
    expect((screen.getByLabelText('Module (optional)') as HTMLInputElement).value).toBe('Module 3');
  });

  it('shows the saved module when editing an existing question', () => {
    render(
      <QuestionForm
        submitLabel="Save"
        initialValue={{
          topic: 'Module 2',
          stem: 'Q',
          options: ['a', 'b', 'c', 'd'],
          correct_index: 0,
          difficulty: 'easy',
        }}
        onSubmit={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('Module (optional)') as HTMLInputElement).value).toBe('Module 2');
    expect(within(document.body).queryByText(/Unsorted/)).toBeTruthy();
  });
});

describe('QuestionForm image', () => {
  it('sends the image and its description with the question', async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <QuestionForm
        submitLabel="Save"
        initialValue={{
          topic: 'Module 1',
          stem: 'Which animal?',
          options: ['cat', 'dog', 'cow', 'hen'],
          correct_index: 0,
          difficulty: 'easy',
          image_url: 'https://x.test/a.png',
          image_alt: 'A cat',
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: 'https://x.test/a.png', image_alt: 'A cat' }),
    );
  });

  it('will not save an image without a description and says why', async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <QuestionForm
        submitLabel="Save"
        initialValue={{
          topic: 'Module 1',
          stem: 'Which animal?',
          options: ['cat', 'dog', 'cow', 'hen'],
          correct_index: 0,
          difficulty: 'easy',
          image_url: 'https://x.test/a.png',
          image_alt: '',
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Describe the image for students who cannot see it'),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the image after adding a question so the next one starts without it', async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <QuestionForm submitLabel="Add question" initialValue={undefined} onSubmit={onSubmit} />,
    );
    expect(screen.getByLabelText('Image (optional)')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Chosen image' })).toBeNull();
  });
});
