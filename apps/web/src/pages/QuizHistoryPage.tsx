import type { Quiz, QuizSessionHistoryRow } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Notice, PageHeader, SkeletonList, TableFrame, buttonClasses } from '../components/ui';
import { api, describeError } from '../lib/api';

const STATUS_LABELS: Record<QuizSessionHistoryRow['status'], string> = {
  lobby: 'Waiting',
  running: 'Running',
  ended: 'Ended',
};

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

  return (
    <div>
      <PageHeader
        title={quiz?.title ?? 'History'}
        description="Every time this quiz was run, with results, feedback and exports."
        back={{ to: `/host/quizzes/${quizId}`, label: 'Back to quiz' }}
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
          This quiz has not been run yet. Start a session from the quiz page and it will appear
          here.
        </p>
      )}
      {rows && rows.length > 0 && (
        <TableFrame label="Sessions of this quiz">
          <table>
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">
                  Students
                </th>
                <th scope="col" className="text-right">
                  Average score
                </th>
                <th scope="col">Feedback</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sessionId}>
                  <td className="whitespace-nowrap">{formatWhen(row.startedAt)}</td>
                  <td className="whitespace-nowrap">{typeLabel(row)}</td>
                  <td>{STATUS_LABELS[row.status]}</td>
                  <td className="text-right tabular-nums">{row.participantCount}</td>
                  <td className="text-right">
                    {row.averageScore === null ? '-' : row.averageScore.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap">
                    {row.averageRating === null ? (
                      <span className="text-muted">-</span>
                    ) : (
                      <span>
                        <span className="text-marker-ink" aria-hidden="true">
                          ★{' '}
                        </span>
                        {row.averageRating.toFixed(1)}{' '}
                        <span className="text-muted">({row.feedbackCount})</span>
                      </span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {row.status === 'ended' ? (
                      <Link
                        to={`/sessions/${row.sessionId}/summary`}
                        className={buttonClasses('secondary', 'sm')}
                      >
                        Open summary
                        <span className="sr-only"> for {formatWhen(row.startedAt)}</span>
                      </Link>
                    ) : (
                      <Link
                        to={`/host/sessions/${row.sessionId}`}
                        className={buttonClasses('brand', 'sm')}
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
        </TableFrame>
      )}
    </div>
  );
}
