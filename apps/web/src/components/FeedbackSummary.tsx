import type { SessionFeedbackResponse } from '@quizup/shared';
import { Panel } from './ui';

export function FeedbackSummary({ feedback }: { feedback: SessionFeedbackResponse | null }) {
  return (
    <Panel title="Student feedback">
      {!feedback || feedback.count === 0 ? (
        <p className="text-muted">
          No feedback yet. Students can rate the assessment once they finish.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-title font-semibold">{feedback.averageRating?.toFixed(1)}</span>{' '}
            <span className="text-muted">
              out of 5 from {feedback.count} {feedback.count === 1 ? 'response' : 'responses'}
            </span>
          </p>
          <p className="text-sm text-muted">
            Anonymous. Students are not named, and answers are listed from highest to lowest rating.
          </p>
          <ul className="divide-y divide-rule border-y border-rule">
            {feedback.items.map((item, index) => (
              <li key={index} className="flex gap-4 py-3">
                <span className="shrink-0 text-marker-ink" aria-label={`${item.rating} out of 5`}>
                  {'★'.repeat(item.rating)}
                  <span aria-hidden="true" className="text-rule-strong">
                    {'★'.repeat(5 - item.rating)}
                  </span>
                </span>
                <span className="min-w-0">
                  {item.comment ? (
                    <span className="block break-words">{item.comment}</span>
                  ) : (
                    <span className="block text-sm text-muted">No comment</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
