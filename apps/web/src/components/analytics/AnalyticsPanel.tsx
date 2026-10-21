import type { AnalyticsSnapshot } from '@quizup/shared';
import { memo, useMemo } from 'react';
import { Panel } from '../ui';
import { LiveIndicator } from './LiveIndicator';
import { MasteryHeatmap } from './MasteryHeatmap';
import { QuestionDifficultyTable } from './QuestionDifficultyTable';
import { ResponseHistogram } from './ResponseHistogram';

interface AnalyticsPanelProps {
  snapshot: AnalyticsSnapshot | null;
  connected: boolean;
  // Shows the live connection badge only while the session runs.
  running?: boolean;
}

// The live numbers under the host console's main card. The leaderboard sits beside the console,
// so it is not repeated here. Response time and mastery share a row at the same height; the
// question table, which needs the width, takes the row below.
export const AnalyticsPanel = memo(function AnalyticsPanel({
  snapshot,
  connected,
  running = true,
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
    <section aria-labelledby="analytics-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="analytics-heading" className="text-base font-medium tracking-tight">
          Analytics
        </h2>
        {running && <LiveIndicator connected={connected} />}
      </div>

      {!snapshot ? (
        <p className="rounded-2xl border border-dashed border-night/20 px-5 py-8 text-center text-sm text-night/55">
          Waiting for the first update...
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-4 xl:grid-cols-2">
            <Panel title="Response time" level={3} className="flex flex-col">
              <ResponseHistogram
                currentCounts={snapshot.currentRoundHistogram}
                sessionCounts={snapshot.sessionHistogram}
                currentLabel={snapshot.adaptive ? 'Current round' : 'Current question'}
              />
            </Panel>
            <Panel title="Mastery heatmap" level={3} className="flex flex-col">
              <MasteryHeatmap topics={snapshot.topics} rows={heatmapRows} />
            </Panel>
          </div>
          <Panel title="Question difficulty: labeled vs observed" level={3}>
            <div className="max-h-80 overflow-y-auto rounded-xl">
              <QuestionDifficultyTable questions={snapshot.questions} />
            </div>
          </Panel>
        </>
      )}
    </section>
  );
});
