import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuestionImage } from './QuestionImage';

afterEach(cleanup);

describe('QuestionImage', () => {
  it('shows the picture with its description', () => {
    render(<QuestionImage imageUrl="https://x.test/a.png" imageAlt="A cat on a sofa" />);
    const image = screen.getByRole('img', { name: 'A cat on a sofa' });
    expect(image.getAttribute('src')).toBe('https://x.test/a.png');
  });

  it('shows nothing when the question has no image', () => {
    const { container } = render(<QuestionImage />);
    expect(container.firstChild).toBeNull();
  });
});
