import type { MyResultRow } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { RequireRole } from '../components/RequireRole';
import { BrandMark } from '../components/branding/BrandMark';
import { Badge, Notice, PageHeader, SkeletonList } from '../components/ui';
import { api, describeError } from '../lib/api';

function typeLabel(row: MyResultRow): string {
  if (row.mode === 'exam') {
    return 'Timed exam';
  }
  return row.adaptive ? 'Adaptive quiz' : 'Live quiz';
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
    <div>
      <PageHeader
        title="My results"
        description="Assessments you took while signed in to QuizUp."
      />
      {message && <Notice tone="danger">{message}</Notice>}
      {!rows && !message && (
        <>
          <span role="status" className="sr-only">
            Loading...
          </span>
          <SkeletonList rows={3} />
        </>
      )}
      {rows && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-rule-strong px-5 py-10 text-center text-muted">
          Nothing here yet. When you join a quiz or exam while signed in, your results appear here.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.sessionId}
              className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-2">
                {row.branding && <BrandMark branding={{ ...row.branding, tagline: undefined }} />}
                <p className="text-lg font-semibold break-words">{row.quizTitle}</p>
                <p className="text-sm text-muted">
                  {typeLabel(row)}
                  {row.endedAt
                    ? `, ${new Date(row.endedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
                    : ', in progress'}
                </p>
              </div>
              <div className="shrink-0 sm:text-right">
                {row.resultsHidden ? (
                  <Badge tone="warning">Results not released yet</Badge>
                ) : row.score === null ? (
                  <span className="text-sm text-muted">No score yet</span>
                ) : (
                  <>
                    <p className="text-xl font-semibold">{row.score.toLocaleString()} points</p>
                    {row.rank !== null && (
                      <p className="text-sm text-muted">
                        Rank {row.rank} of {row.participantCount}
                      </p>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MyResultsPage() {
  return (
    <RequireRole roles={['student', 'host', 'admin']} deniedNotice="Sign in first.">
      <MyResultsContent />
    </RequireRole>
  );
}
