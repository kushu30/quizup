import type { AssessmentType, Quiz, QuizSessionHistoryRow } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BLEED, PageBody, PageHeader } from '../components/app/Page';
import { AppIcon, ICONS } from '../components/app/icons';
import { AuthNotice } from '../components/landing/AuthField';
import { ctaLight, ctaSize, ctaSoft } from '../components/landing/cta';
import { Frame, RULE } from '../components/landing/frame';
import { QuizTypeIcon } from '../components/quizMeta';
import { StatusPill } from '../components/ui';
import { api, describeError } from '../lib/api';

const STATUS_LABELS: Record<QuizSessionHistoryRow['status'], string> = {
  lobby: 'Waiting',
  running: 'Running',
  ended: 'Ended',
};

function typeOf(row: QuizSessionHistoryRow): AssessmentType {
  if (row.mode === 'exam') {
    return 'exam';
  }
  return row.adaptive ? 'adaptive' : 'live';
}

function typeLabel(row: QuizSessionHistoryRow): string {
  if (row.mode === 'exam') {
    return 'Timed exam';
  }
  return row.adaptive ? 'Adaptive quiz' : 'Live quiz';
}

function formatWhen(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not started';
}

export function QuizHistoryPage() {
  const { quizId = '' } = useParams();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [rows, setRows] = useState<QuizSessionHistoryRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getQuiz(quizId), api.listQuizSessions(quizId)])
      .then(([loadedQuiz, loadedRows]) => {
        if (!cancelled) {
          setQuiz(loadedQuiz);
          setRows(loadedRows);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(describeError(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const ran = rows ?? [];
  const rated = ran.filter((row) => row.averageRating !== null && row.feedbackCount > 0);
  const ratingVotes = rated.reduce((sum, row) => sum + row.feedbackCount, 0);
  const stats = [
    { label: 'Sessions', value: String(ran.length) },
    {
      label: 'Students reached',
      value: ran.reduce((sum, row) => sum + row.participantCount, 0).toLocaleString(),
    },
    {
      label: 'Rating',
      value: ratingVotes
        ? (
            rated.reduce((sum, row) => sum + (row.averageRating ?? 0) * row.feedbackCount, 0) /
            ratingVotes
          ).toFixed(1)
        : '–',
    },
  ];

  return (
    <section className="flex flex-1 flex-col">
      <PageHeader
        back={{ to: `/host/quizzes/${quizId}`, label: quiz?.title ?? 'Quiz' }}
        title={quiz?.title ?? 'History'}
        description="Every time this quiz was run, with results, feedback and exports."
        actions={
          <Link
            to={`/host/quizzes/${quizId}`}
            className={`${ctaLight} ${ctaSize.md} self-start lg:self-auto`}
          >
            Edit quiz
          </Link>
        }
      >
        {message && (
          <AuthNotice tone="danger" className="mt-6">
            {message}
          </AuthNotice>
        )}
      </PageHeader>

      <section aria-label="Overview" className={`border-b ${RULE} ${BLEED}`}>
        <Frame flush>
          <dl className="grid grid-cols-3">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={`px-4 py-5 sm:px-6 ${RULE} ${index > 0 ? 'border-l' : ''}`}
              >
                <dt className="text-sm text-night/55">{stat.label}</dt>
                <dd className="mt-1 font-geist-mono text-[1.625rem] font-medium tracking-tight text-night tabular-nums">
                  {rows ? stat.value : '–'}
                </dd>
              </div>
            ))}
          </dl>
        </Frame>
      </section>

      <PageBody>
        {!rows && !message && (
          <>
            <span role="status" className="sr-only">
              Loading...
            </span>
            <div aria-hidden="true" className="divide-y divide-dashed divide-night/15">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-4 px-4 py-5 sm:px-10">
                  <div className="h-5 w-5 shrink-0 animate-shimmer rounded-md bg-night/[0.06]" />
                  <div className="h-4 flex-1 animate-shimmer rounded bg-night/[0.06]" />
                  <div className="h-8 w-28 animate-shimmer rounded-[0.7rem] bg-night/[0.06]" />
                </div>
              ))}
            </div>
          </>
        )}
        {rows && rows.length === 0 && (
          <div className="flex flex-col items-center gap-5 px-4 py-20 text-center sm:px-10">
            <AppIcon size={28} className="text-night/30">
              {ICONS.history}
            </AppIcon>
            <p className="max-w-sm leading-relaxed text-night/55">
              This quiz has not been run yet. Start a session from the quiz page and it will appear
              here.
            </p>
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table aria-label="Sessions of this quiz" className="w-full min-w-[44rem] text-left">
              <thead>
                <tr className={`border-b text-xs font-medium text-night/45 ${RULE}`}>
                  <th scope="col" className={`${CELL} pl-4 sm:pl-10`}>
                    Started
                  </th>
                  <th scope="col" className={CELL}>
                    Type
                  </th>
                  <th scope="col" className={CELL}>
                    Status
                  </th>
                  <th scope="col" className={`${CELL} text-right`}>
                    Students
                  </th>
                  <th scope="col" className={CELL}>
                    Feedback
                  </th>
                  <th scope="col" className={`${CELL} pr-4 sm:pr-10`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-night/15 text-[0.9375rem]">
                {rows.map((row) => (
                  <tr
                    key={row.sessionId}
                    className="transition-colors duration-200 ease-soft hover:bg-canvas"
                  >
                    <td className={`${ROW_CELL} pl-4 whitespace-nowrap text-night sm:pl-10`}>
                      {formatWhen(row.startedAt)}
                    </td>
                    <td className={`${ROW_CELL} whitespace-nowrap text-night/70`}>
                      <span className="inline-flex items-center gap-2 align-middle">
                        <QuizTypeIcon type={typeOf(row)} size={18} />
                        {typeLabel(row)}
                      </span>
                    </td>
                    <td className={ROW_CELL}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className={`${ROW_CELL} text-right text-night/80 tabular-nums`}>
                      {row.participantCount}
                    </td>
                    <td className={`${ROW_CELL} whitespace-nowrap`}>
                      {row.averageRating === null ? (
                        <span className="text-night/35">–</span>
                      ) : (
                        <span className="text-night/80 tabular-nums">
                          <span className="text-amber-500" aria-hidden="true">
                            ★{' '}
                          </span>
                          {row.averageRating.toFixed(1)}{' '}
                          <span className="text-night/40">({row.feedbackCount})</span>
                        </span>
                      )}
                    </td>
                    <td className={`${ROW_CELL} pr-4 text-right whitespace-nowrap sm:pr-10`}>
                      {row.status === 'ended' ? (
                        <Link
                          to={`/sessions/${row.sessionId}/summary`}
                          className={`${ctaLight} ${ctaSize.sm}`}
                        >
                          Open summary
                          <span className="sr-only"> for {formatWhen(row.startedAt)}</span>
                        </Link>
                      ) : (
                        <Link
                          to={`/host/sessions/${row.sessionId}`}
                          className={`${ctaSoft} ${ctaSize.sm}`}
                        >
                          Open console
                          <span className="sr-only"> for code {row.joinCode}</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </section>
  );
}

const CELL = 'px-3 py-3 font-medium';
const ROW_CELL = 'px-3 py-4';

const PILL_STATUS = { lobby: 'waiting', running: 'live', ended: 'ended' } as const;

function StatusBadge({ status }: { status: QuizSessionHistoryRow['status'] }) {
  return <StatusPill status={PILL_STATUS[status]}>{STATUS_LABELS[status]}</StatusPill>;
}
