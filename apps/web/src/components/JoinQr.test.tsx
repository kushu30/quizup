import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JoinQr } from './JoinQr';

afterEach(cleanup);

const URL = 'https://quizup-khaki.vercel.app/join/K7M2QX';

function darkCells(svg: Element) {
  return [...svg.querySelectorAll('rect[data-dark]')].map(
    (rect) => `${rect.getAttribute('x')},${rect.getAttribute('y')}`,
  );
}

describe('JoinQr', () => {
  it('is an image named after the link it encodes', () => {
    render(<JoinQr url={URL} />);
    expect(screen.getByRole('img', { name: `QR code for ${URL}` })).toBeTruthy();
  });

  it('draws the modules inside a four-module quiet zone with finder patterns in the corners', () => {
    render(<JoinQr url={URL} />);
    const svg = screen.getByRole('img');
    const [, , width] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    const cells = darkCells(svg);
    expect(cells).toContain('4,4');
    expect(cells).not.toContain('3,3');
    expect(cells).toContain(`${(width ?? 0) - 5},4`);
    expect(cells).toContain(`4,${(width ?? 0) - 5}`);
    expect(cells).not.toContain(`${(width ?? 0) - 5},${(width ?? 0) - 5}`);
  });

  it('changes when the link changes', () => {
    const { rerender } = render(<JoinQr url={URL} />);
    const first = darkCells(screen.getByRole('img')).join(' ');
    rerender(<JoinQr url="https://quizup-khaki.vercel.app/join/ZZ9ZZ9" />);
    expect(darkCells(screen.getByRole('img')).join(' ')).not.toBe(first);
  });
});
