import {
  DEFAULT_QUESTION_DURATION_SECONDS,
  quizCreateSchema,
  sessionCreateSchema,
  type QuizActivity,
  type QuizWithCount,
} from '@quizup/shared';
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AssessmentType } from '@quizup/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NewQuizDialog } from '../components/NewQuizDialog';
import { QUIZ_COLUMNS, QuizCard } from '../components/QuizCard';
import { AuthNotice } from '../components/landing/AuthField';
import { ctaPrimary, ctaSize } from '../components/landing/cta';
import { Frame, RULE } from '../components/landing/frame';
import { BLEED, PageBody, PageHeader } from '../components/app/Page';
import { AppIcon, ICONS } from '../components/app/icons';
import { quizTypeOf } from '../components/quizMeta';
import { api, describeError } from '../lib/api';
import { useAutoDismiss } from '../lib/useAutoDismiss';

type TypeFilter = 'all' | AssessmentType;

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'adaptive', label: 'Adaptive' },
  { key: 'exam', label: 'Exam' },
];

export function Host() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const searchId = useId();
  const [quizzes, setQuizzes] = useState<QuizWithCount[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<Map<string, QuizActivity>>(new Map());
  const [runningQuizId, setRunningQuizId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuizWithCount | null>(null);
  const [naming, setNaming] = useState(false);
  const messageFading = useAutoDismiss(message, () => setMessage(null));
  const titleInputId = useId();
  const titleHintId = `${titleInputId}-hint`;

  const load = useCallback(async () => {
    try {
      const [loadedQuizzes, loadedActivity] = await Promise.all([
        api.listQuizzes(),
        api.getQuizActivity().catch(() => []),
      ]);
      setQuizzes(loadedQuizzes);
      setActivity(new Map(loadedActivity.map((entry) => [entry.quizId, entry])));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const typed = useMemo(() => quizzes.map((quiz) => ({ quiz, type: quizTypeOf(quiz) })), [quizzes]);
  const visible = typed.filter(
    ({ quiz, type }) =>
      (typeFilter === 'all' || type === typeFilter) &&
      quiz.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const live = quizzes
    .map((quiz) => ({ quiz, entry: activity.get(quiz.id) }))
    .filter(
      (row): row is { quiz: QuizWithCount; entry: QuizActivity } =>
        row.entry !== undefined && row.entry.latest.status !== 'ended',
    );
  const stats = [
    { label: 'Quizzes', value: quizzes.length },
    {
      label: 'Questions',
      value: quizzes.reduce((sum, quiz) => sum + quiz.question_count, 0),
    },
    {
      label: 'Sessions run',
      value: [...activity.values()].reduce((sum, entry) => sum + entry.sessionCount, 0),
    },
    { label: 'Live now', value: live.length, live: live.length > 0 },
  ];

  async function createWithTitle(rawTitle: string): Promise<string | null> {
    const parsed = quizCreateSchema.safeParse({ title: rawTitle });
    if (!parsed.success) {
      return parsed.error.issues.map((issue) => issue.message).join('; ');
    }
    try {
      const quiz = await api.createQuiz(parsed.data);
      navigate(`/host/quizzes/${quiz.id}`);
      return null;
    } catch (error) {
      return describeError(error);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === '') {
      setNaming(true);
      return;
    }
    const problem = await createWithTitle(title);
    if (problem) {
      setMessage(problem);
    }
  }

  async function handleRun(quizId: string) {
    setRunningQuizId(quizId);
    setMessage(null);
    try {
      const summary = await api.createSession(
        sessionCreateSchema.parse({
          quizId,
          questionDurationSeconds: DEFAULT_QUESTION_DURATION_SECONDS,
        }),
      );
      navigate(`/host/sessions/${summary.session.id}`);
    } catch (error) {
      setMessage(describeError(error));
      setRunningQuizId(null);
    }
  }

  async function handleDelete(quizId: string) {
    try {
      await api.deleteQuiz(quizId);
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  return (
    <section className="flex flex-1 flex-col">
      <PageHeader
        title="Your quizzes"
        description="Write questions, run sessions and see how every class did."
        actions={
          <form
            onSubmit={(event) => void handleCreate(event)}
            noValidate
            className="flex w-full items-center gap-2 lg:w-auto"
          >
            <label htmlFor={titleInputId} className="sr-only">
              New quiz title
            </label>
            <input
              id={titleInputId}
              aria-describedby={titleHintId}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Name a new quiz"
              className="h-10 min-w-0 flex-1 rounded-[0.8rem] bg-white px-4 text-[0.9375rem] text-night shadow-[0_0_0_1px_rgba(17,16,20,0.12)] transition-shadow duration-200 ease-soft placeholder:text-night/40 hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none lg:w-64 lg:flex-none"
            />
            <button type="submit" className={`${ctaPrimary} ${ctaSize.md}`}>
              Create quiz
            </button>
            <p id={titleHintId} className="sr-only">
              Type a title here, or just press Create quiz and name it next.
            </p>
          </form>
        }
      >
        {message && (
          <AuthNotice
            tone="danger"
            className="mt-6"
            fading={messageFading}
            onDismiss={() => setMessage(null)}
          >
            {message}
          </AuthNotice>
        )}
      </PageHeader>

      <section aria-label="Overview" className={`border-b ${RULE} ${BLEED}`}>
        <Frame flush>
          <dl className="grid grid-cols-2 md:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={`px-4 py-5 sm:px-6 ${RULE} ${index % 2 ? 'border-l' : ''} ${
                  index > 1 ? 'border-t md:border-t-0' : ''
                } ${index === 2 ? 'md:border-l' : ''}`}
              >
                <dt className="flex items-center gap-2 text-sm text-night/55">
                  {stat.live && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 animate-live rounded-full bg-accent-500"
                    />
                  )}
                  {stat.label}
                </dt>
                <dd className="mt-1 font-geist-mono text-[1.625rem] font-medium tracking-tight text-night tabular-nums">
                  {loading ? '–' : stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </Frame>
      </section>

      <PageBody>
        {!loading && live.length > 0 && (
          <section
            aria-label="Running now"
            className="mx-4 mt-6 overflow-hidden sm:mx-10 rounded-2xl bg-accent-50/70 shadow-[0_0_0_1px_var(--color-accent-200)]"
          >
            <ul className="divide-y divide-accent-200/70">
              {live.map(({ quiz, entry }) => (
                <li
                  key={quiz.id}
                  className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 animate-live rounded-full bg-accent-500"
                    />
                    <p className="min-w-0 truncate text-[0.9375rem]">
                      <span className="font-medium text-night">{quiz.title}</span>
                      <span className="text-night/55">
                        {' '}
                        · {entry.latest.status === 'lobby'
                          ? 'Waiting in the lobby'
                          : 'In progress'}{' '}
                        · Code{' '}
                        <span className="font-geist-mono tracking-wider text-night/80">
                          {entry.latest.joinCode}
                        </span>
                      </span>
                    </p>
                  </div>
                  <Link
                    to={`/host/sessions/${entry.latest.sessionId}`}
                    className={`${ctaPrimary} ${ctaSize.sm} shrink-0 self-start sm:self-auto`}
                  >
                    Go to console
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="flex flex-col gap-3 px-4 py-6 sm:px-10 md:flex-row md:items-center md:justify-between">
          <div
            role="group"
            aria-label="Filter by type"
            className="flex w-full overflow-x-auto rounded-[0.9rem] bg-night/[0.05] p-1 md:w-auto"
          >
            {FILTERS.map((filter) => {
              const count =
                filter.key === 'all'
                  ? typed.length
                  : typed.filter(({ type }) => type === filter.key).length;
              const active = typeFilter === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTypeFilter(filter.key)}
                  className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[0.65rem] px-3 text-sm whitespace-nowrap transition-[background-color,box-shadow,color] duration-200 ease-soft md:flex-none ${
                    active
                      ? 'bg-white font-medium text-night shadow-[0_0_0_1px_rgba(17,16,20,0.06),0_1px_2px_rgba(17,16,20,0.1)]'
                      : 'text-night/55 hover:text-night'
                  }`}
                >
                  {filter.label}
                  <span className="font-geist-mono text-xs text-night/40 tabular-nums">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="relative md:w-72">
            <label htmlFor={searchId} className="sr-only">
              Search quizzes
            </label>
            <AppIcon
              size={16}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-night/40"
            >
              {ICONS.search}
            </AppIcon>
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quizzes"
              className="h-10 w-full rounded-[0.8rem] bg-white pr-3 pl-10 text-[0.9375rem] text-night shadow-[0_0_0_1px_rgba(17,16,20,0.12)] transition-shadow duration-200 ease-soft placeholder:text-night/40 hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none"
            />
          </div>
        </div>

        <div
          aria-hidden="true"
          className={`hidden border-y px-4 py-2.5 text-xs font-medium text-night/45 sm:px-10 xl:grid xl:gap-6 ${RULE} ${QUIZ_COLUMNS}`}
        >
          <span className="pl-[2.125rem]">Quiz</span>
          <span>Questions</span>
          <span>Activity</span>
          <span className="text-right">Actions</span>
        </div>
        <div className={`border-b xl:border-t-0 ${RULE} border-t`}>
          {loading && (
            <>
              <span role="status" className="sr-only">
                Loading...
              </span>
              <div aria-hidden="true" className="divide-y divide-dashed divide-night/15">
                {[0, 1, 2].map((row) => (
                  <div key={row} data-skeleton-row className="flex items-center gap-4 px-5 py-4">
                    <div className="h-11 w-11 shrink-0 animate-shimmer rounded-xl bg-night/[0.06]" />
                    <div className="flex-1 space-y-2.5">
                      <div className="h-4 w-1/3 animate-shimmer rounded bg-night/[0.06]" />
                      <div className="h-3.5 w-1/2 animate-shimmer rounded bg-night/[0.06]" />
                    </div>
                    <div className="hidden h-8 w-48 animate-shimmer rounded-[0.7rem] bg-night/[0.06] md:block" />
                  </div>
                ))}
              </div>
            </>
          )}
          {!loading && quizzes.length === 0 && (
            <div className="flex flex-col items-center gap-5 px-5 py-16 text-center">
              <AppIcon size={28} className="text-night/30">
                {ICONS.dashboard}
              </AppIcon>
              <p className="max-w-sm leading-relaxed text-night/55">
                No quizzes yet. Give your first one a title above to start adding questions.
              </p>
            </div>
          )}
          {!loading && quizzes.length > 0 && visible.length === 0 && (
            <div className="px-5 py-14 text-center">
              <p className="text-night/55">No quizzes match.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setTypeFilter('all');
                }}
                className="mt-2 text-sm font-medium text-night underline decoration-night/25 underline-offset-4 transition-colors hover:decoration-night"
              >
                Clear the search and filter
              </button>
            </div>
          )}
          {!loading && visible.length > 0 && (
            <div className="animate-fade-in divide-y divide-dashed divide-night/15">
              {visible.map(({ quiz }) => (
                <QuizCard
                  key={quiz.id}
                  quiz={quiz}
                  activity={activity.get(quiz.id)}
                  running={runningQuizId === quiz.id}
                  onRun={() => void handleRun(quiz.id)}
                  onDelete={() => setPendingDelete(quiz)}
                />
              ))}
            </div>
          )}
        </div>
      </PageBody>
      {naming && (
        <NewQuizDialog
          onCancel={() => setNaming(false)}
          onSubmit={async (chosenTitle) => {
            const problem = await createWithTitle(chosenTitle);
            if (!problem) {
              setNaming(false);
            }
            return problem;
          }}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          modern
          title="Delete this quiz?"
          confirmLabel="Delete quiz"
          cancelLabel="Keep quiz"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            void handleDelete(target.id);
          }}
        >
          <p>
            <strong className="font-medium text-night">{pendingDelete.title}</strong> and all its
            questions will be removed. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
