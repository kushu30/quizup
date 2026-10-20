import {
  assessmentTypeOf,
  hasBranding,
  quizSettingsSchema,
  splitStoredBranding,
  type AssessmentType,
  type QuizActivity,
  type QuizWithCount,
} from '@quizup/shared';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from './branding/BrandMark';
import { CopyButton } from './CopyButton';
import { Badge, Button, buttonClasses } from './ui';

const TYPE_LABELS: Record<AssessmentType, string> = {
  live: 'Live quiz',
  adaptive: 'Adaptive quiz',
  exam: 'Timed exam',
};

interface QuizCardProps {
  quiz: QuizWithCount;
  activity: QuizActivity | undefined;
  running: boolean;
  onRun: () => void;
  onDelete: () => void;
}

function runSummary(activity: QuizActivity | undefined): string {
  if (!activity) {
    return 'Never run';
  }
  const sessions = `${activity.sessionCount} ${activity.sessionCount === 1 ? 'session' : 'sessions'}`;
  const lastRun = activity.latest.startedAt ?? null;
  return lastRun
    ? `${sessions}, last run ${new Date(lastRun).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
    : sessions;
}

export function QuizCard({ quiz, activity, running, onRun, onDelete }: QuizCardProps) {
  const titleId = useId();
  const { settings, branding } = splitStoredBranding(quiz.settings);
  const parsed = quizSettingsSchema.safeParse(settings);
  const type = parsed.success ? assessmentTypeOf(parsed.data) : 'live';
  const open = activity !== undefined && activity.latest.status !== 'ended';
  const joinUrl = activity ? `${window.location.origin}/join/${activity.latest.joinCode}` : '';

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col overflow-hidden rounded-lg border border-rule bg-surface"
    >
      <div
        aria-hidden="true"
        className="h-1.5"
        style={{ backgroundColor: branding?.brandColor ?? '#1e5446' }}
      />
      <div className="flex flex-1 flex-col gap-4 p-5">
        {(hasBranding(branding) || open) && (
          <div className="flex items-start justify-between gap-3">
            {hasBranding(branding) ? (
              <BrandMark branding={{ ...branding, tagline: undefined }} />
            ) : (
              <span />
            )}
            {open && <Badge tone="success">Live now</Badge>}
          </div>
        )}
        <div className="space-y-1">
          <h2 id={titleId} className="text-lg font-semibold break-words">
            {quiz.title}
          </h2>
          <p className="text-sm text-muted">
            {TYPE_LABELS[type]}, {quiz.question_count}{' '}
            {quiz.question_count === 1 ? 'question' : 'questions'}
          </p>
          <p className="text-sm text-muted">{runSummary(activity)}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-start gap-2 border-t border-rule pt-4">
          {open && activity ? (
            <Link
              to={`/host/sessions/${activity.latest.sessionId}`}
              className={buttonClasses('brand', 'sm')}
            >
              Open console
            </Link>
          ) : (
            <Button variant="brand" size="sm" disabled={running} onClick={onRun}>
              {running ? 'Starting...' : 'Run'}
            </Button>
          )}
          <Link to={`/host/quizzes/${quiz.id}`} className={buttonClasses('secondary', 'sm')}>
            Edit
          </Link>
          <Link to={`/host/quizzes/${quiz.id}/history`} className={buttonClasses('ghost', 'sm')}>
            History
          </Link>
          {open && (
            <CopyButton
              text={joinUrl}
              label="Copy link"
              size="sm"
              statusClassName="text-xs text-muted"
            />
          )}
          <button
            type="button"
            aria-label={`Delete ${quiz.title}`}
            onClick={onDelete}
            className="ml-auto inline-flex min-h-8 items-center rounded-md px-3 text-sm font-semibold text-alert hover:bg-alert-soft"
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
