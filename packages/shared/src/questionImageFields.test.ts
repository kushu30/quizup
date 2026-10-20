import { describe, expect, it } from 'vitest';
import { questionInputSchema, questionUpdateSchema } from './api.js';

const BASE = {
  stem: 'Which animal?',
  options: ['cat', 'dog', 'cow', 'hen'],
  correct_index: 0,
  difficulty: 'easy' as const,
};
const URL = 'https://abc.supabase.co/storage/v1/object/public/question-images/h/cat.png';

describe('question image fields', () => {
  it('accepts a question with no image, with null, or with the fields left out', () => {
    expect(questionInputSchema.safeParse(BASE).success).toBe(true);
    expect(
      questionInputSchema.safeParse({ ...BASE, image_url: null, image_alt: null }).success,
    ).toBe(true);
  });

  it('accepts an image together with its description, trimmed', () => {
    const parsed = questionInputSchema.parse({ ...BASE, image_url: URL, image_alt: '  A cat ' });
    expect(parsed.image_url).toBe(URL);
    expect(parsed.image_alt).toBe('A cat');
  });

  it('refuses an image without a description, and says why', () => {
    for (const image_alt of [undefined, null, '', '   ']) {
      const result = questionInputSchema.safeParse({ ...BASE, image_url: URL, image_alt });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).toContain('Describe the image');
    }
  });

  it('refuses an address that is not https, and a description that is too long', () => {
    expect(
      questionInputSchema.safeParse({ ...BASE, image_url: 'http://x.test/a.png', image_alt: 'a' })
        .success,
    ).toBe(false);
    expect(
      questionInputSchema.safeParse({ ...BASE, image_url: URL, image_alt: 'x'.repeat(201) })
        .success,
    ).toBe(false);
  });

  it('lets an update remove the image by sending null for both fields', () => {
    expect(questionUpdateSchema.parse({ image_url: null, image_alt: null })).toEqual({
      image_url: null,
      image_alt: null,
    });
  });

  it('refuses an update that sets an image without a description', () => {
    expect(questionUpdateSchema.safeParse({ image_url: URL }).success).toBe(false);
  });

  it('leaves the image alone when an update does not mention it', () => {
    expect(questionUpdateSchema.parse({ stem: 'New' })).toEqual({ stem: 'New' });
  });
});
