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
    expect(dialog.textContent).toMatch(/camera and microphone are off unless you turn them on/i);
    expect(dialog.textContent).toMatch(/students are told/i);
  });

  it('starts with proctoring, or without it', () => {
    const { onChoose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Start with proctoring' }));
    expect(onChoose).toHaveBeenLastCalledWith({
      proctored: true,
      proctorCamera: false,
      proctorMic: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start without proctoring' }));
    expect(onChoose).toHaveBeenLastCalledWith({
      proctored: false,
      proctorCamera: false,
      proctorMic: false,
    });
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

  it('lets the host turn the camera and the microphone on separately', () => {
    const { onChoose } = renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start with proctoring' }));
    expect(onChoose).toHaveBeenLastCalledWith({
      proctored: true,
      proctorCamera: true,
      proctorMic: false,
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Listen to the microphone/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start with proctoring' }));
    expect(onChoose).toHaveBeenLastCalledWith({
      proctored: true,
      proctorCamera: true,
      proctorMic: true,
    });
  });

  it('says plainly that nothing is recorded or sent', () => {
    renderDialog();
    expect(screen.getByRole('dialog').textContent).toMatch(/nothing is recorded/i);
  });

  it('keeps the camera and microphone off when starting without proctoring', () => {
    const { onChoose } = renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start without proctoring' }));
    expect(onChoose).toHaveBeenLastCalledWith({
      proctored: false,
      proctorCamera: false,
      proctorMic: false,
    });
  });

  it('offers auto-submit only for an exam with the camera or microphone on', () => {
    renderDialog({ kind: 'exam' });
    expect(screen.queryByRole('checkbox', { name: /Submit the exam automatically/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Listen to the microphone/ }));
    expect(screen.getByRole('checkbox', { name: /Submit the exam automatically/ })).toBeTruthy();
    cleanup();
    renderDialog({ kind: 'live' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    expect(screen.queryByRole('checkbox', { name: /Submit the exam automatically/ })).toBeNull();
  });

  it('starts at 10 flags, keeps the limit between 3 and 50, and sends it', () => {
    const { onChoose } = renderDialog({ kind: 'exam' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Submit the exam automatically/ }));
    const limit = screen.getByRole('spinbutton', { name: /Flags before submitting/ });
    expect((limit as HTMLInputElement).value).toBe('10');
    fireEvent.change(limit, { target: { value: '2' } });
    fireEvent.blur(limit);
    expect((limit as HTMLInputElement).value).toBe('3');
    fireEvent.change(limit, { target: { value: '99' } });
    fireEvent.blur(limit);
    expect((limit as HTMLInputElement).value).toBe('50');
    fireEvent.change(limit, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start with proctoring' }));
    expect(onChoose).toHaveBeenLastCalledWith({
      proctored: true,
      proctorCamera: true,
      proctorMic: false,
      proctorFlagLimit: 7,
    });
  });

  it('leaves the limit out when auto-submit is off, or when both devices are turned off again', () => {
    const { onChoose } = renderDialog({ kind: 'exam' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start with proctoring' }));
    expect(onChoose.mock.lastCall?.[0]).not.toHaveProperty('proctorFlagLimit');
    fireEvent.click(screen.getByRole('checkbox', { name: /Submit the exam automatically/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch the camera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start with proctoring' }));
    expect(onChoose.mock.lastCall?.[0]).toEqual({
      proctored: true,
      proctorCamera: false,
      proctorMic: false,
    });
  });
});
