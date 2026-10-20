import { describe, expect, it } from 'vitest';
import { isOwnQuestionImageUrl } from './questionImageUrl.js';

const SUPABASE = 'https://abc.supabase.co';
const OWN = `${SUPABASE}/storage/v1/object/public/question-images/host/cat.png`;

describe('isOwnQuestionImageUrl', () => {
  it('accepts an image from this project’s question-images bucket', () => {
    expect(isOwnQuestionImageUrl(OWN, SUPABASE)).toBe(true);
    expect(isOwnQuestionImageUrl(OWN, `${SUPABASE}/`)).toBe(true);
  });

  it('refuses any other address, so a question cannot load pictures from elsewhere', () => {
    for (const url of [
      'https://evil.example/track.png',
      `${SUPABASE}/storage/v1/object/public/branding/host/logo.png`,
      `${SUPABASE}.evil.example/storage/v1/object/public/question-images/a.png`,
      `${SUPABASE}/storage/v1/object/public/question-images/../branding/a.png`,
      `http://abc.supabase.co/storage/v1/object/public/question-images/a.png`,
      'not a url',
    ]) {
      expect(isOwnQuestionImageUrl(url, SUPABASE)).toBe(false);
    }
  });
});
