import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LogoMark, QuizUpLogo } from './QuizUpLogo';

afterEach(cleanup);

describe('QuizUpLogo', () => {
  it('is one image named QuizUp, whatever the wordmark is made of', () => {
    render(<QuizUpLogo />);
    const logo = screen.getByRole('img', { name: 'QuizUp' });
    expect(logo.textContent).toBe('QuizUp');
  });

  it('draws the four-squares mark with an amber check square', () => {
    const { container } = render(<LogoMark size={48} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(container.querySelectorAll('rect')).toHaveLength(4);
    expect(container.querySelector('rect[fill="#e9b949"]')).toBeTruthy();
    expect(container.querySelector('path')).toBeTruthy();
  });

  it('puts Up in the brand green on light and in amber on dark', () => {
    const { container, rerender } = render(<QuizUpLogo tone="color" />);
    expect(container.querySelector('[data-part="up"]')?.className).toContain('text-board');
    rerender(<QuizUpLogo tone="onDark" />);
    expect(container.querySelector('[data-part="up"]')?.className).toContain('text-marker');
  });

  it('can be the mark alone', () => {
    const { container } = render(<QuizUpLogo wordmark={false} />);
    expect(container.querySelector('[data-part="up"]')).toBeNull();
    expect(screen.getByRole('img', { name: 'QuizUp' })).toBeTruthy();
  });

  it('draws a one-colour mark that knocks the check out of the filled square', () => {
    const { container } = render(<LogoMark tone="mono" knock="#ffffff" />);
    expect(container.querySelector('rect[fill="#e9b949"]')).toBeNull();
    expect(container.querySelector('path')?.getAttribute('stroke')).toBe('#ffffff');
  });
});
