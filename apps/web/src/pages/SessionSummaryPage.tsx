import {
  PROCTOR_COUNTED_TYPES,
  PROCTOR_TYPE_LABELS,
  type AnalyticsSnapshot,
  type ExportType,
} from '@quizup/shared';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Leaderboard } from '../components/Leaderboard';
import { MasteryHeatmap } from '../components/analytics/MasteryHeatmap';
import { QuestionDifficultyTable } from '../components/analytics/QuestionDifficultyTable';
import { ResponseHistogram } from '../components/analytics/ResponseHistogram';
import { Button, Notice, PageHeader, Panel, TableFrame } from '../components/ui';
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
      <div>
        <PageHeader title="Session summary" back={{ to: '/host', label: 'Back to dashboard' }} />
        {message ? (
          <Notice tone="danger">{message}</Notice>
        ) : (
          <p role="status" className="text-muted">
            Loading...
          </p>
        )}
      </div>
    );
  }

  const facts = [
    `Status ${summary.status}`,
    ...(summary.adaptive ? ['adaptive'] : []),
    `${summary.participants.length} students`,
    `${summary.roundsCompleted} rounds completed`,
  ].join(', ');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session summary"
        description={facts}
        back={{ to: '/host', label: 'Back to dashboard' }}
        actions={(['participants', 'responses'] as const).map((type) => (
          <Button
            key={type}
            variant="secondary"
            disabled={downloading !== null}
            onClick={() => void handleDownload(type)}
          >
            {downloading === type ? 'Preparing...' : EXPORT_LABELS[type]}
          </Button>
        ))}
      />
      {summary.source === 'rebuilt' && (
        <Notice tone="warning">
          This summary was rebuilt from the saved responses. Time buckets use the slowest answer as
          the time limit and projections are not available.
        </Notice>
      )}
      {message && <Notice tone="danger">{message}</Notice>}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-2">
        <Panel title="Final leaderboard">
          <Leaderboard entries={summary.leaderboard} />
        </Panel>

        <Panel title="Response time">
          <ResponseHistogram
            currentCounts={summary.currentRoundHistogram}
            sessionCounts={summary.sessionHistogram}
            currentLabel="Last round"
          />
        </Panel>
      </div>

      <Panel title="Questions">
        <QuestionDifficultyTable questions={summary.questions} showMedian />
      </Panel>

      <Panel title="Mastery">
        <MasteryHeatmap topics={summary.topics} rows={heatmapRows} />
      </Panel>

      {summary.mode === 'exam' && (
        <Panel
          title="Proctor signals per student"
          description="These are indicators recorded with the student's consent, not proof of misconduct."
        >
          <TableFrame label="Proctor signals per student table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col" className="text-right">
                    Score
                  </th>
                  {PROCTOR_COUNTED_TYPES.map((type) => (
                    <th key={type} scope="col" className="text-right">
                      {PROCTOR_TYPE_LABELS[type]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...summary.participants]
                  .sort((first, second) => first.displayName.localeCompare(second.displayName))
                  .map((participant) => (
                    <tr key={participant.participantId}>
                      <td className="font-medium">{participant.displayName}</td>
                      <td className="text-right tabular-nums">{participant.score}</td>
                      {PROCTOR_COUNTED_TYPES.map((type) => (
                        <td key={type} className="text-right tabular-nums">
                          {participant.proctorCounts?.[type] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableFrame>
        </Panel>
      )}

      {summary.mode !== 'exam' && (
        <Panel
          title="Projection vs actual"
          description={`${
            summary.checkpointRound
              ? `Projection made after round ${summary.checkpointRound}, compared with the final score.`
              : 'No projection checkpoint was reached.'
          }${summary.adaptive ? ' Adaptive sessions are always low confidence.' : ''}`}
        >
          <TableFrame label="Projection vs actual table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col" className="text-right">
                    Projected
                  </th>
                  <th scope="col" className="text-right">
                    Actual final
                  </th>
                  <th scope="col" className="text-right">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.participants.map((participant) => (
                  <tr key={participant.participantId}>
                    <td className="font-medium">{participant.displayName}</td>
                    <td className="text-right tabular-nums">
                      {participant.checkpointProjection === null
                        ? '-'
                        : Math.round(participant.checkpointProjection).toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums">
                      {participant.score.toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums">
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
          </TableFrame>
        </Panel>
      )}
    </div>
  );
}
