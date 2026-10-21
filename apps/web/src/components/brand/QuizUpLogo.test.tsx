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

  it('draws the tile Q with a tail in the accent colour', () => {
    const { container } = render(<LogoMark size={48} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(container.querySelector('[data-part="tile"]')?.getAttribute('fill')).toBe('#111014');
    expect(container.querySelector<SVGElement>('[data-part="tail"]')?.style.fill).toContain(
      '--color-accent-500',
    );
  });

  it('turns white with a lighter tail on dark backgrounds', () => {
    const { container } = render(<LogoMark tone="onDark" />);
    expect(container.querySelector('[data-part="tile"]')?.getAttribute('fill')).toBe('#ffffff');
    expect(container.querySelector<SVGElement>('[data-part="tail"]')?.style.fill).toContain(
      '--color-accent-400',
    );
  });

  it('cuts the counter out instead of painting it, so it sits on any background', () => {
    const { container } = render(<LogoMark />);
    const tile = container.querySelector('[data-part="tile"]');
    const maskId = tile?.getAttribute('mask')?.match(/url\(#(.+)\)/)?.[1];
    expect(maskId && container.querySelector(`mask[id="${maskId}"]`)).toBeTruthy();
  });

  it('can be the mark alone', () => {
    const { container } = render(<QuizUpLogo wordmark={false} />);
    expect(container.querySelector('[data-part="up"]')).toBeNull();
    expect(screen.getByRole('img', { name: 'QuizUp' })).toBeTruthy();
  });

  it('draws a one-colour mark in the current text colour', () => {
    const { container } = render(<LogoMark tone="mono" />);
    expect(container.querySelector('[data-part="tile"]')?.getAttribute('fill')).toBe(
      'currentColor',
    );
    expect(
      container.querySelector<SVGElement>('[data-part="tail"]')?.style.fill.toLowerCase(),
    ).toBe('currentcolor');
  });
});
