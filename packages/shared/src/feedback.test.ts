import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_COMMENT_MAX,
  feedbackSubmitPayloadSchema,
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
