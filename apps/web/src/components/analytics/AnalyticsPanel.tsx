import type { AnalyticsSnapshot } from '@quizup/shared';
import { memo, useMemo } from 'react';
import { Leaderboard } from '../Leaderboard';
import { LiveIndicator } from './LiveIndicator';
import { MasteryHeatmap } from './MasteryHeatmap';
import { ProjectionTable } from './ProjectionTable';
import { QuestionDifficultyTable } from './QuestionDifficultyTable';
import { ResponseHistogram } from './ResponseHistogram';

interface AnalyticsPanelProps {
  snapshot: AnalyticsSnapshot | null;
  connected: boolean;
}

export const AnalyticsPanel = memo(function AnalyticsPanel({
  snapshot,
  connected,
}: AnalyticsPanelProps) {
  const heatmapRows = useMemo(
    () =>
      (snapshot?.participants ?? []).map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        score: participant.score,
        mastery: participant.mastery,
      })),
    [snapshot?.participants],
  );

  return (
    <section
      className="space-y-6 rounded-xl border border-slate-200 p-4"
      aria-label="Live analytics"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <LiveIndicator connected={connected} />
      </div>

      {!snapshot ? (
        <p className="text-slate-500">Waiting for the first update...</p>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="font-medium">Leaderboard</h3>
            <Leaderboard entries={snapshot.leaderboard} />
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Students and projected final score</h3>
            <ProjectionTable participants={snapshot.participants} adaptive={snapshot.adaptive} />
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Mastery heatmap</h3>
            <MasteryHeatmap topics={snapshot.topics} rows={heatmapRows} />
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Response time</h3>
            <ResponseHistogram
              currentCounts={snapshot.currentRoundHistogram}
              sessionCounts={snapshot.sessionHistogram}
              currentLabel={snapshot.adaptive ? 'Current round' : 'Current question'}
            />
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Question difficulty: labeled vs observed</h3>
            <QuestionDifficultyTable questions={snapshot.questions} />
          </div>
        </>
      )}
    </section>
  );
});
