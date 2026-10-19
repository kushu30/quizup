import type { AnalyticsTopic } from '@quizup/shared';
import { memo, useMemo, useState } from 'react';
import { useStableRows } from '../../lib/stableRows';
import { TableFrame } from '../ui';

export interface HeatmapRow {
  participantId: string;
  displayName: string;
  score: number;
  mastery: (number | null)[];
}

interface MasteryHeatmapProps {
  topics: AnalyticsTopic[];
  rows: HeatmapRow[];
}

const NO_DATA_CLASSES = 'bg-[#eceff3] text-muted';

const SEQUENTIAL_CLASSES = [
  'bg-[#eef4f1] text-ink',
  'bg-[#cfe2da] text-ink',
  'bg-[#94c2b0] text-ink',
  'bg-[#3a7d68] text-white',
  'bg-board text-white',
];

function masteryClasses(mastery: number | null): string {
  if (mastery === null) {
    return NO_DATA_CLASSES;
  }
  const bin = Math.min(
    Math.floor(mastery * SEQUENTIAL_CLASSES.length),
    SEQUENTIAL_CLASSES.length - 1,
  );
  return SEQUENTIAL_CLASSES[bin] as string;
}

const HeatmapRowView = memo(function HeatmapRowView({
  row,
  topics,
}: {
  row: HeatmapRow;
  topics: AnalyticsTopic[];
}) {
  return (
    <tr>
      <th scope="row" className="font-medium whitespace-nowrap text-ink">
        {row.displayName}
      </th>
      {topics.map((topic, index) => {
        const mastery = row.mastery[index] ?? null;
        const label =
          mastery === null
            ? `${row.displayName}, ${topic.label}: no data`
            : `${row.displayName}, ${topic.label}: mastery ${mastery.toFixed(2)}`;
        return (
          <td
            key={topic.key}
            title={label}
            aria-label={label}
            className={`text-center font-medium tabular-nums ${masteryClasses(mastery)}`}
          >
            {mastery === null ? '–' : mastery.toFixed(2)}
          </td>
        );
      })}
    </tr>
  );
});

export function MasteryHeatmap({ topics, rows }: MasteryHeatmapProps) {
  const [sortBy, setSortBy] = useState<'score' | 'name'>('score');
  const stableRows = useStableRows(rows, (row) => row.participantId);
  const stableTopics = useStableRows(topics, (topic) => topic.key);

  const sortedRows = useMemo(
    () =>
      [...stableRows].sort((first, second) =>
        sortBy === 'score'
          ? second.score - first.score || first.displayName.localeCompare(second.displayName)
          : first.displayName.localeCompare(second.displayName),
      ),
    [stableRows, sortBy],
  );

  if (stableTopics.length === 0) {
    return <p className="text-muted">Topics appear once questions are served.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">Mastery per topic, 0 (none) to 1 (full)</span>
        <label className="flex items-center gap-2 font-medium">
          Sort by
          <select
            className="min-h-8 rounded-md border border-rule-strong bg-surface px-2 py-1 font-normal"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'score' | 'name')}
          >
            <option value="score">Score</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <TableFrame label="Mastery heatmap table">
        <table className="border-collapse">
          <thead>
            <tr>
              <th scope="col">Student</th>
              {stableTopics.map((topic) => (
                <th key={topic.key} scope="col" className="text-center">
                  {topic.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <HeatmapRowView key={row.participantId} row={row} topics={stableTopics} />
            ))}
          </tbody>
        </table>
      </TableFrame>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Low</span>
        {SEQUENTIAL_CLASSES.map((classes) => (
          <span
            key={classes}
            className={`h-4 w-8 rounded-sm border border-rule ${classes}`}
            aria-hidden="true"
          />
        ))}
        <span>High</span>
        <span className={`ml-3 rounded-sm px-2 py-0.5 ${NO_DATA_CLASSES}`}>– no data</span>
      </div>
    </div>
  );
}
