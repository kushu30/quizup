import type { AssessmentType, MyResultRow } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { AuthNotice } from '../components/landing/AuthField';
import { PageBody, PageHeader } from '../components/app/Page';
import { AppIcon, ICONS } from '../components/app/icons';
import { Institution, QuizTypeIcon, TYPE_LABELS } from '../components/quizMeta';
import { RequireRole } from '../components/RequireRole';
import { api, describeError } from '../lib/api';

function typeOf(row: MyResultRow): AssessmentType {
  if (row.mode === 'exam') {
    return 'exam';
  }
  return row.adaptive ? 'adaptive' : 'live';
}

function MyResultsContent() {
  const [rows, setRows] = useState<MyResultRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMyResults()
      .then((loaded) => {
        if (!cancelled) {
          setRows(loaded);
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
  }, []);

  return (
    <section className="flex flex-1 flex-col">
      <PageHeader title="My results" description="Assessments you took while signed in to QuizUp.">
        {message && (
          <AuthNotice tone="danger" className="mt-6">
            {message}
          </AuthNotice>
        )}
      </PageHeader>
      <PageBody>
        {!rows && !message && (
          <>
            <span role="status" className="sr-only">
              Loading...
            </span>
            <div aria-hidden="true" className="divide-y divide-dashed divide-night/15">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-4 px-4 py-5 sm:px-10">
                  <div className="h-6 w-6 shrink-0 animate-shimmer rounded-md bg-night/[0.06]" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-4 w-1/3 animate-shimmer rounded bg-night/[0.06]" />
                    <div className="h-3.5 w-1/2 animate-shimmer rounded bg-night/[0.06]" />
                  </div>
                  <div className="h-5 w-24 animate-shimmer rounded bg-night/[0.06]" />
                </div>
              ))}
            </div>
          </>
        )}
        {rows && rows.length === 0 && (
          <div className="flex flex-col items-center gap-5 px-4 py-20 text-center sm:px-10">
            <AppIcon size={28} className="text-night/30">
              {ICONS.results}
            </AppIcon>
            <p className="max-w-sm leading-relaxed text-night/55">
              Nothing here yet. When you join a quiz or exam while signed in, your results appear
              here.
            </p>
          </div>
        )}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-dashed divide-night/15">
            {rows.map((row) => {
              const type = typeOf(row);
              return (
                <li
                  key={row.sessionId}
                  className="flex flex-col gap-4 px-4 py-5 transition-colors duration-300 ease-soft hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:px-10"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <QuizTypeIcon type={type} />
                    <div className="min-w-0">
                      <p className="text-[1.0625rem] font-medium tracking-tight break-words">
                        {row.quizTitle}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-night/55">
                        <span>{TYPE_LABELS[type]}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {row.endedAt
                            ? new Date(row.endedAt).toLocaleDateString(undefined, {
                                dateStyle: 'medium',
                              })
                            : 'In progress'}
                        </span>
                        {row.branding && (
                          <>
                            <span aria-hidden="true">·</span>
                            <Institution branding={row.branding} />
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="ml-10 shrink-0 sm:ml-0 sm:text-right">
                    {row.resultsHidden ? (
                      <span className="inline-flex rounded-lg bg-amber-50 px-2.5 py-1 text-[0.8125rem] font-medium text-amber-900 shadow-[inset_0_0_0_1px_var(--color-amber-200)]">
                        Results not released yet
                      </span>
                    ) : row.score === null ? (
                      <span className="text-sm text-night/50">No score yet</span>
                    ) : (
                      <>
                        <p className="text-lg font-medium tracking-tight tabular-nums">
                          {row.score.toLocaleString()} points
                        </p>
                        {row.rank !== null && (
                          <p className="mt-0.5 text-sm text-night/50 tabular-nums">
                            Rank {row.rank} of {row.participantCount}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </section>
  );
}

export function MyResultsPage() {
  return (
    <RequireRole roles={['student', 'host', 'admin']} deniedNotice="Sign in first.">
      <MyResultsContent />
    </RequireRole>
  );
}
