import { FEEDBACK_COMMENT_MAX, type FeedbackSubmitPayload } from '@quizup/shared';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ctaPrimary, ctaSize } from './landing/cta';
import { CARD } from './play/PlayStage';
import { Notice, TextAreaField } from './ui';

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
      <div className={`${CARD} p-6 text-center`}>
        <p role="status" className="text-lg font-medium">
          Thanks for your feedback.
        </p>
        <p className="mt-1 text-sm text-night/55">Your host will see it without your name.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className={`${CARD} space-y-5 p-5 sm:p-6`}
    >
      <div className="space-y-3">
        <h2 id={headingId} className="text-lg font-medium tracking-tight">
          How was this assessment?
        </h2>
        <p className="text-sm text-night/55">
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
                  className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl leading-none transition-[background-color,box-shadow,color,transform] duration-200 ease-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-night active:scale-95 ${
                    filled
                      ? 'bg-amber-50 text-amber-500 shadow-[0_0_0_1.5px_var(--color-amber-400)]'
                      : 'bg-white text-night/20 shadow-[0_0_0_1px_rgba(17,16,20,0.14)] hover:text-night/40'
                  }`}
                >
                  ★
                </span>
              </label>
            );
          })}
        </div>
        <p className="min-h-5 text-sm text-night/55">
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
      <button type="submit" disabled={sending} className={`${ctaPrimary} ${ctaSize.md}`}>
        Send feedback
      </button>
    </form>
  );
}
