import { FEEDBACK_COMMENT_MAX, type FeedbackSubmitPayload } from '@quizup/shared';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button, Notice, TextAreaField } from './ui';

const RATING_WORDS = ['very poor', 'poor', 'okay', 'good', 'excellent'];

interface FeedbackFormProps {
  submit: (payload: FeedbackSubmitPayload) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function FeedbackForm({ submit }: FeedbackFormProps) {
  const headingId = useId();
  const name = useId();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }
    if (rating === null) {
      setRatingError('Choose a rating from 1 to 5.');
      return;
    }
    inFlight.current = true;
    setSending(true);
    setSendError(null);
    try {
      const result = await submit({
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      if (result.ok) {
        setSent(true);
      } else {
        setSendError('Your feedback could not be sent. Try again.');
      }
    } catch {
      setSendError('Your feedback could not be sent. Try again.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-rule bg-surface p-6 text-center">
        <p role="status" className="text-lg font-semibold">
          Thanks for your feedback.
        </p>
        <p className="mt-1 text-sm text-muted">Your host will see it without your name.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="space-y-5 rounded-lg border border-rule bg-surface p-6"
    >
      <div className="space-y-3">
        <h2 id={headingId} className="text-xl font-semibold">
          How was this assessment?
        </h2>
        <p className="text-sm text-muted">
          This is anonymous. Your host will not see your name with your answer.
        </p>
        <div role="radiogroup" aria-labelledby={headingId} className="flex gap-2">
          {RATING_WORDS.map((word, index) => {
            const value = index + 1;
            const filled = rating !== null && value <= rating;
            return (
              <label key={word} className="cursor-pointer">
                <input
                  type="radio"
                  name={name}
                  value={value}
                  checked={rating === value}
                  aria-label={`${value} out of 5, ${word}`}
                  onChange={() => {
                    setRating(value);
                    setRatingError(null);
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`flex h-11 w-11 items-center justify-center rounded-md border-2 text-2xl leading-none peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-board ${
                    filled
                      ? 'border-marker bg-marker-soft text-marker-ink'
                      : 'border-rule text-rule-strong'
                  }`}
                >
                  ★
                </span>
              </label>
            );
          })}
        </div>
        <p className="min-h-5 text-sm text-muted">
          {rating ? `${rating} out of 5, ${RATING_WORDS[rating - 1]}` : ''}
        </p>
        {ratingError && <p className="text-sm font-medium text-alert">{ratingError}</p>}
      </div>
      <TextAreaField
        label="What went well or was hard? (optional)"
        rows={3}
        maxLength={FEEDBACK_COMMENT_MAX}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      {sendError && <Notice tone="danger">{sendError}</Notice>}
      <Button type="submit" variant="brand" disabled={sending}>
        Send feedback
      </Button>
    </form>
  );
}
