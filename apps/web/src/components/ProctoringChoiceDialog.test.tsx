import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProctoringChoiceDialog } from './ProctoringChoiceDialog';

afterEach(cleanup);

function renderDialog(props: Partial<Parameters<typeof ProctoringChoiceDialog>[0]> = {}) {
  const onChoose = vi.fn();
  const onCancel = vi.fn();
  render(
    <ProctoringChoiceDialog
      kind="live"
      busy={false}
      onChoose={onChoose}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onChoose, onCancel };
}

describe('ProctoringChoiceDialog', () => {
  it('asks the host to decide before the session starts', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Proctor this session?' });
    expect(dialog.textContent).toContain('tab switches');
    expect(dialog.textContent).toContain('no webcam');
    expect(dialog.textContent).toMatch(/students are told/i);
  });

  it('starts with proctoring, or without it', () => {
    const { onChoose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Start with proctoring' }));
    expect(onChoose).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start without proctoring' }));
    expect(onChoose).toHaveBeenLastCalledWith(false);
  });

  it('says exams also ask for full screen, quizzes do not', () => {
    const { rerender } = render(
      <ProctoringChoiceDialog kind="exam" busy={false} onChoose={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('dialog').textContent).toMatch(/full screen/i);
    rerender(
      <ProctoringChoiceDialog kind="live" busy={false} onChoose={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('dialog').textContent).not.toMatch(/full screen/i);
  });

  it('cancels with the button or Escape and starts nothing', () => {
    const { onChoose, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('holds the buttons while the session is starting', () => {
    renderDialog({ busy: true });
    expect(
      (screen.getByRole('button', { name: 'Start with proctoring' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
