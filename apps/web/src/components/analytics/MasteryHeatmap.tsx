import type { AnalyticsTopic } from '@quizup/shared';
import { memo, useMemo, useState } from 'react';
import { useStableRows } from '../../lib/stableRows';

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

const NO_DATA_CLASSES = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

const SEQUENTIAL_CLASSES = [
  'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
  'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-50',
  'bg-blue-300 text-blue-950 dark:bg-blue-800 dark:text-white',
  'bg-blue-500 text-white dark:bg-blue-600 dark:text-white',
  'bg-blue-700 text-white dark:bg-blue-400 dark:text-blue-950',
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
      <th scope="row" className="whitespace-nowrap px-3 py-1 text-left font-medium">
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
            className={`px-3 py-1 text-center tabular-nums ${masteryClasses(mastery)}`}
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
    return <p className="text-slate-500">Topics appear once questions are served.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          Mastery per topic, 0 (none) to 1 (full)
        </span>
        <label className="flex items-center gap-2">
          Sort by
          <select
            className="rounded-md border border-slate-300 bg-transparent px-2 py-1"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'score' | 'name')}
          >
            <option value="score">Score</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <th scope="col" className="px-3 py-2 text-left">
                Student
              </th>
              {stableTopics.map((topic) => (
                <th key={topic.key} scope="col" className="px-3 py-2 text-center">
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
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span>Low</span>
        {SEQUENTIAL_CLASSES.map((classes) => (
          <span key={classes} className={`h-4 w-8 rounded ${classes}`} aria-hidden="true" />
        ))}
        <span>High</span>
        <span className={`ml-3 rounded px-2 py-0.5 ${NO_DATA_CLASSES}`}>– no data</span>
      </div>
    </div>
  );
}
