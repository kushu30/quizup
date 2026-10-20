import { z } from 'zod';

export const FEEDBACK_COMMENT_MAX = 500;

export const feedbackSubmitPayloadSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().max(FEEDBACK_COMMENT_MAX).optional(),
    ),
  })
  .strict();
export type FeedbackSubmitPayload = z.infer<typeof feedbackSubmitPayloadSchema>;

export const sessionFeedbackItemSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
});
export type SessionFeedbackItem = z.infer<typeof sessionFeedbackItemSchema>;

export const sessionFeedbackResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  averageRating: z.number().nullable(),
  items: z.array(sessionFeedbackItemSchema),
});
export type SessionFeedbackResponse = z.infer<typeof sessionFeedbackResponseSchema>;

export function summarizeFeedback(items: { rating: number }[]): {
  count: number;
  averageRating: number | null;
} {
  if (items.length === 0) {
    return { count: 0, averageRating: null };
  }
  const total = items.reduce((sum, item) => sum + item.rating, 0);
  return { count: items.length, averageRating: Math.round((total / items.length) * 10) / 10 };
}
