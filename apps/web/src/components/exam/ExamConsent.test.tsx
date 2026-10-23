import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExamConsent } from './ExamConsent';

afterEach(cleanup);

function renderConsent(
  proctored: boolean,
  media: { camera?: boolean; mic?: boolean; flagLimit?: number | null } = {},
) {
  render(
    <ExamConsent
      durationMinutes={20}
      proctored={proctored}
      camera={media.camera}
      mic={media.mic}
      flagLimit={media.flagLimit}
      busy={false}
      error={null}
      onAccept={vi.fn()}
      onDecline={vi.fn()}
    />,
  );
}

describe('ExamConsent', () => {
  it('lists what is monitored and what is not when the exam is proctored', () => {
    renderConsent(true);
    expect(screen.getByRole('heading', { name: /what is monitored/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /what is not collected/i })).toBeTruthy();
    expect(screen.getByText(/shown to your host/i)).toBeTruthy();
  });

  it('says plainly that nothing is recorded when the host chose no proctoring', () => {
    renderConsent(false);
    expect(screen.queryByRole('heading', { name: /what is monitored/i })).toBeNull();
    expect(screen.queryByText(/shown to your host/i)).toBeNull();
    expect(screen.getByText(/not proctored/i)).toBeTruthy();
    expect(screen.getByText(/20 minutes/)).toBeTruthy();
  });

  it('still lets the student accept or decline', () => {
    renderConsent(false);
    expect(screen.getByRole('button', { name: /accept and start the exam/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /decline and go back/i })).toBeTruthy();
  });

  it('still says there is no webcam or microphone when the host turned neither on', () => {
    renderConsent(true);
    expect(screen.getByText('No webcam')).toBeTruthy();
    expect(screen.getByText('No microphone')).toBeTruthy();
  });

  it('explains the camera, and no longer claims there is no webcam', () => {
    renderConsent(true, { camera: true });
    expect(screen.getByText(/camera is used on your device/i)).toBeTruthy();
    expect(screen.queryByText('No webcam')).toBeNull();
    expect(screen.getByText('No microphone')).toBeTruthy();
    expect(screen.getByText(/no video or audio is recorded, uploaded or streamed/i)).toBeTruthy();
  });

  it('explains the microphone, and no longer claims there is no microphone', () => {
    renderConsent(true, { mic: true });
    expect(screen.getByText(/microphone is used on your device/i)).toBeTruthy();
    expect(screen.queryByText('No microphone')).toBeNull();
    expect(screen.getByText('No webcam')).toBeTruthy();
  });

  it('states the auto-submit limit before the student accepts', () => {
    renderConsent(true, { camera: true, flagLimit: 10 });
    expect(
      screen.getByText('If you are flagged 10 times, your exam is submitted automatically.'),
    ).toBeTruthy();
  });

  it('does not mention a limit when the host set none', () => {
    renderConsent(true, { camera: true, flagLimit: null });
    expect(screen.queryByText(/submitted automatically/i)).toBeNull();
  });
});
