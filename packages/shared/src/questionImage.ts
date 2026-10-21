import { z } from 'zod';

export const QUESTION_IMAGE_BUCKET = 'question-images';
export const QUESTION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const QUESTION_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const QUESTION_IMAGE_ALT_MAX = 200;
export const QUESTION_IMAGE_URL_MAX = 500;

export const questionImagePayloadShape = {
  imageUrl: z.string().url().max(QUESTION_IMAGE_URL_MAX).optional(),
  imageAlt: z.string().max(QUESTION_IMAGE_ALT_MAX).optional(),
};

export interface QuestionImageSource {
  imageUrl?: string | undefined;
  imageAlt?: string | undefined;
}

export function questionImageOf(source: QuestionImageSource): QuestionImageSource {
  return source.imageUrl ? { imageUrl: source.imageUrl, imageAlt: source.imageAlt ?? '' } : {};
}
