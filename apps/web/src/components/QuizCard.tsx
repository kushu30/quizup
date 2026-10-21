import { splitStoredBranding, type QuizActivity, type QuizWithCount } from '@quizup/shared';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon, ICONS } from './app/icons';
import { CopyButton } from './CopyButton';
import { Tooltip } from './ui';
import { ctaLight, ctaQuiet, ctaSize, ctaSoft } from './landing/cta';
import { Institution, QuizTypeIcon, TYPE_LABELS, quizTypeOf } from './quizMeta';

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

function LiveBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent-200)]">
      <span aria-hidden="true" className="h-1.5 w-1.5 animate-live rounded-full bg-accent-500" />
      Live now
    </span>
  );
}

export function QuizCard({ quiz, activity, running, onRun, onDelete }: QuizCardProps) {
  const titleId = useId();
  const { branding } = splitStoredBranding(quiz.settings);
  const type = quizTypeOf(quiz);
  const open = activity !== undefined && activity.latest.status !== 'ended';
  const joinUrl = activity ? `${window.location.origin}/join/${activity.latest.joinCode}` : '';

  return (
    <article
      aria-labelledby={titleId}
      className={`flex flex-col gap-3 px-4 py-4 transition-colors duration-200 ease-soft hover:bg-canvas sm:px-10 xl:grid xl:items-center xl:gap-6 ${QUIZ_COLUMNS}`}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <QuizTypeIcon type={type} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2
              id={titleId}
              className="min-w-0 truncate text-[0.9375rem] font-medium tracking-tight"
            >
              {quiz.title}
            </h2>
            {open && <LiveBadge />}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-night/55">
            <span>{TYPE_LABELS[type]}</span>
            {branding && (
              <>
                <span aria-hidden="true">·</span>
                <Institution branding={branding} />
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 pl-[2.125rem] text-sm text-night/55 xl:contents">
        <span className="text-night/70 tabular-nums">
          {quiz.question_count} {quiz.question_count === 1 ? 'question' : 'questions'}
        </span>
        <span aria-hidden="true" className="xl:hidden">
          ·
        </span>
        <span>{runSummary(activity)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-[2.125rem] xl:flex-nowrap xl:justify-end xl:pl-0">
        {open && (
          <CopyButton
            text={joinUrl}
            label="Copy link"
            buttonClassName={`${ctaQuiet} ${ctaSize.sm}`}
            statusClassName="absolute top-full right-0 z-10 mt-1 rounded-md bg-night px-2 py-1 text-xs whitespace-nowrap text-white empty:hidden"
          />
        )}
        {open && activity ? (
          <Link
            to={`/host/sessions/${activity.latest.sessionId}`}
            className={`${ctaSoft} ${ctaSize.sm}`}
          >
            Open console
          </Link>
        ) : (
          <button
            type="button"
            disabled={running}
            onClick={onRun}
            className={`${ctaLight} ${ctaSize.sm}`}
          >
            {running ? 'Starting...' : 'Run'}
          </button>
        )}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-night/10" />
        <Tooltip label="Edit">
          <Link to={`/host/quizzes/${quiz.id}`} aria-label="Edit" className={ICON_BUTTON}>
            <AppIcon size={16}>{ICONS.edit}</AppIcon>
          </Link>
        </Tooltip>
        <Tooltip label="Run history">
          <Link
            to={`/host/quizzes/${quiz.id}/history`}
            aria-label="History"
            className={ICON_BUTTON}
          >
            <AppIcon size={16}>{ICONS.history}</AppIcon>
          </Link>
        </Tooltip>
        <Tooltip label="Delete quiz">
          <button
            type="button"
            aria-label={`Delete ${quiz.title}`}
            onClick={onDelete}
            className={`${ICON_BUTTON} hover:bg-alert/[0.08] hover:text-alert`}
          >
            <AppIcon size={16}>{ICONS.trash}</AppIcon>
          </button>
        </Tooltip>
      </div>
    </article>
  );
}

// The columns of the quiz table on wide screens, shared with its header row.
export const QUIZ_COLUMNS = 'xl:grid-cols-[minmax(0,1fr)_7rem_13rem_24rem]';

const ICON_BUTTON =
  'flex h-8 w-8 items-center justify-center rounded-[0.6rem] text-night/45 transition-colors duration-200 ease-soft hover:bg-night/[0.05] hover:text-night';
