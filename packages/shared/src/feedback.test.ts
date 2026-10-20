import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_COMMENT_MAX,
  feedbackSubmitPayloadSchema,
  sessionFeedbackItemSchema,
  summarizeFeedback,
} from './feedback.js';

describe('feedback', () => {
  it('needs a whole rating from 1 to 5', () => {
    for (const rating of [0, 6, 2.5, '4']) {
      expect(feedbackSubmitPayloadSchema.safeParse({ rating }).success).toBe(false);
    }
    expect(feedbackSubmitPayloadSchema.parse({ rating: 5 })).toEqual({ rating: 5 });
  });

  it('keeps a trimmed comment and drops a blank one', () => {
    expect(feedbackSubmitPayloadSchema.parse({ rating: 3, comment: '  Too fast  ' })).toEqual({
      rating: 3,
      comment: 'Too fast',
    });
    expect(feedbackSubmitPayloadSchema.parse({ rating: 3, comment: '   ' })).toEqual({ rating: 3 });
    expect(
      feedbackSubmitPayloadSchema.safeParse({
        rating: 3,
        comment: 'x'.repeat(FEEDBACK_COMMENT_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(feedbackSubmitPayloadSchema.safeParse({ rating: 3, participantId: 'x' }).success).toBe(
      false,
    );
  });

  it('summarizes count and average rating to one decimal', () => {
    expect(summarizeFeedback([])).toEqual({ count: 0, averageRating: null });
    expect(summarizeFeedback([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({
      count: 3,
      averageRating: 4.3,
    });
  });
});

describe('sessionFeedbackItemSchema', () => {
  it('keeps only the rating and the comment, so nothing identifies the student', () => {
    const parsed = sessionFeedbackItemSchema.parse({
      displayName: 'Ada',
      participantId: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-10-19T10:00:00Z',
      rating: 4,
      comment: 'Clear',
    });
    expect(parsed).toEqual({ rating: 4, comment: 'Clear' });
  });
});
