import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentIntro } from './StudentIntro';

afterEach(cleanup);

const BRAND = {
  institutionName: 'Lincoln High',
  welcomeMessage: 'Good luck, everyone.',
  instructions: 'Keep your phone on silent.',
  brandColor: '#7A1F2B',
};

function renderIntro(props: Partial<Parameters<typeof StudentIntro>[0]> = {}) {
  const onDone = vi.fn();
  render(
    <StudentIntro
      quizTitle="Fractions review"
      displayName="Ada"
      branding={BRAND}
      assessmentType="live"
      onDone={onDone}
      {...props}
    />,
  );
  return { onDone };
}

describe('StudentIntro', () => {
  it('welcomes the student with the institution, title and welcome message', () => {
    renderIntro();
    expect(screen.getByRole('heading', { level: 1, name: 'Fractions review' })).toBeTruthy();
    expect(screen.getByText('Lincoln High')).toBeTruthy();
    expect(screen.getByText('Good luck, everyone.')).toBeTruthy();
    expect(screen.getByText(/Ada/)).toBeTruthy();
    expect(screen.getByText(/Powered by/)).toBeTruthy();
  });

  it('shows the host instructions and live rules next, then finishes', () => {
    const { onDone } = renderIntro();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Instructions' })).toBeTruthy();
    expect(screen.getByText('Keep your phone on silent.')).toBeTruthy();
    expect(screen.getByText(/Faster correct answers earn more points/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('explains that adaptive questions differ between students', () => {
    renderIntro({ assessmentType: 'adaptive' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/classmates may see different questions/)).toBeTruthy();
  });

  it('lists the exam rules with the length and proctoring signals', () => {
    renderIntro({ assessmentType: 'exam', durationMinutes: 45 });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/You have 45 minutes/)).toBeTruthy();
    expect(screen.getByText(/when your host releases them/)).toBeTruthy();
  });

  it("tells students of every type that proctoring is the host's choice and they will be told", () => {
    for (const assessmentType of ['live', 'adaptive', 'exam'] as const) {
      renderIntro({ assessmentType, durationMinutes: 30 });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByText(/if your host turns on proctoring/i)).toBeTruthy();
      cleanup();
    }
  });

  it('works without any branding', () => {
    renderIntro({ branding: null });
    expect(screen.getByRole('img', { name: 'QuizUp' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('From your host')).toBeNull();
  });

  it('can step back from the instructions to the welcome', () => {
    renderIntro();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Fractions review' })).toBeTruthy();
  });
});
