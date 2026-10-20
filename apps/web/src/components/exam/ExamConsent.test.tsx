import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExamConsent } from './ExamConsent';

afterEach(cleanup);

function renderConsent(proctored: boolean) {
  render(
    <ExamConsent
      durationMinutes={20}
      proctored={proctored}
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
});
