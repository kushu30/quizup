import type { AnalyticsSnapshot, ExportType } from '@quizup/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Leaderboard } from '../components/Leaderboard';
import { MasteryHeatmap } from '../components/analytics/MasteryHeatmap';
import { QuestionDifficultyTable } from '../components/analytics/QuestionDifficultyTable';
import { ResponseHistogram } from '../components/analytics/ResponseHistogram';
import { api, describeError } from '../lib/api';
import { saveBlob } from '../lib/download';

const EXPORT_LABELS: Record<ExportType, string> = {
  participants: 'Download participants CSV',
  responses: 'Download responses CSV',
};

export function SessionSummaryPage() {
  const { sessionId = '' } = useParams();
  const [summary, setSummary] = useState<AnalyticsSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ExportType | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSessionSummary(sessionId)
      .then((loaded) => {
        if (!cancelled) {
          setSummary(loaded);
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
  }, [sessionId]);

  const heatmapRows = useMemo(
    () =>
      (summary?.participants ?? []).map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        score: participant.score,
        mastery: participant.mastery,
      })),
    [summary?.participants],
  );

  async function handleDownload(type: ExportType) {
    setDownloading(type);
    setMessage(null);
    try {
      saveBlob(
        await api.downloadExport(sessionId, type),
        `quizup-${sessionId.slice(0, 8)}-${type}.csv`,
      );
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setDownloading(null);
    }
  }

  if (!summary) {
    return (
      <div className="space-y-2">
        <Link to="/host" className="text-sm hover:underline">
          Back to dashboard
        </Link>
        <p className="text-slate-600">{message ?? 'Loading...'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link to="/host" className="text-sm hover:underline">
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold">Session summary</h1>
        <p className="text-sm text-slate-600">
          Status {summary.status}
          {summary.adaptive ? ' · adaptive' : ''} · {summary.participants.length} students ·{' '}
          {summary.roundsCompleted} rounds completed
        </p>
        {summary.source === 'rebuilt' && (
          <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
            This summary was rebuilt from the saved responses. Time buckets use the slowest answer
            as the time limit and projections are not available.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(['participants', 'responses'] as const).map((type) => (
            <button
              key={type}
              type="button"
              disabled={downloading !== null}
              onClick={() => void handleDownload(type)}
              className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {downloading === type ? 'Preparing...' : EXPORT_LABELS[type]}
            </button>
          ))}
        </div>
        {message && <p className="text-sm text-red-700">{message}</p>}
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Final leaderboard</h2>
        <Leaderboard entries={summary.leaderboard} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Questions</h2>
        <QuestionDifficultyTable questions={summary.questions} showMedian />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Response time</h2>
        <ResponseHistogram
          currentCounts={summary.currentRoundHistogram}
          sessionCounts={summary.sessionHistogram}
          currentLabel="Last round"
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Mastery</h2>
        <MasteryHeatmap topics={summary.topics} rows={heatmapRows} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Projection vs actual</h2>
        <p className="text-sm text-slate-600">
          {summary.checkpointRound
            ? `Projection made after round ${summary.checkpointRound}, compared with the final score.`
            : 'No projection checkpoint was reached.'}
          {summary.adaptive ? ' Adaptive sessions are always low confidence.' : ''}
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Projected</th>
                <th className="px-3 py-2">Actual final</th>
                <th className="px-3 py-2">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {summary.participants.map((participant) => (
                <tr key={participant.participantId}>
                  <td className="px-3 py-2">{participant.displayName}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {participant.checkpointProjection === null
                      ? '-'
                      : Math.round(participant.checkpointProjection).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{participant.score.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {participant.checkpointProjection === null
                      ? '-'
                      : Math.round(
                          participant.score - participant.checkpointProjection,
                        ).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
