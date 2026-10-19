import type { AnalyticsSnapshot } from '@quizup/shared';
import { memo, useMemo } from 'react';
import { Leaderboard } from '../Leaderboard';
import { Panel } from '../ui';
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
    <section aria-labelledby="analytics-heading" className="space-y-6 border-t border-rule pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="analytics-heading" className="text-title font-semibold tracking-tight">
          Analytics
        </h2>
        <LiveIndicator connected={connected} />
      </div>

      {!snapshot ? (
        <p className="text-muted">Waiting for the first update...</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
          <Panel title="Leaderboard" level={3}>
            <Leaderboard entries={snapshot.leaderboard} />
          </Panel>

          <Panel title="Response time" level={3}>
            <ResponseHistogram
              currentCounts={snapshot.currentRoundHistogram}
              sessionCounts={snapshot.sessionHistogram}
              currentLabel={snapshot.adaptive ? 'Current round' : 'Current question'}
            />
          </Panel>

          <Panel title="Students and projected final score" level={3} className="xl:col-span-2">
            <ProjectionTable participants={snapshot.participants} adaptive={snapshot.adaptive} />
          </Panel>

          <Panel title="Mastery heatmap" level={3} className="xl:col-span-2">
            <MasteryHeatmap topics={snapshot.topics} rows={heatmapRows} />
          </Panel>

          <Panel
            title="Question difficulty: labeled vs observed"
            level={3}
            className="xl:col-span-2"
          >
            <QuestionDifficultyTable questions={snapshot.questions} />
          </Panel>
        </div>
      )}
    </section>
  );
});
