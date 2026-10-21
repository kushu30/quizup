import type { AnalyticsTopic } from '@quizup/shared';
import { memo, useMemo, useState } from 'react';
import { useStableRows } from '../../lib/stableRows';
import { useModernLook } from '../app/shellContext';
import { Dropdown } from '../ui/Dropdown';
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

// The same five steps as one blue getting deeper: pale for low mastery up to solid.
const LEVEL_FILLS = [
  'bg-night/[0.07]',
  'bg-night/[0.18]',
  'bg-night/[0.38]',
  'bg-night/[0.62]',
  'bg-night/90',
];

function masteryLevel(mastery: number): number {
  return Math.min(Math.floor(mastery * 5), 4);
}

const HeatmapRowView = memo(function HeatmapRowView({
  row,
  topics,
  modern,
}: {
  row: HeatmapRow;
  topics: AnalyticsTopic[];
  modern: boolean;
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
            className={
              modern
                ? 'relative min-w-14 p-0 text-center font-medium tabular-nums'
                : `text-center font-medium tabular-nums ${masteryClasses(mastery)}`
            }
          >
            {modern && mastery !== null && (
              <span
                aria-hidden="true"
                className={`absolute inset-0 ${LEVEL_FILLS[masteryLevel(mastery)]}`}
              />
            )}
            <span
              className={
                modern
                  ? `relative inline-block rounded px-1 text-[11px] ${
                      mastery === null
                        ? 'text-night/30'
                        : masteryLevel(mastery) >= 3
                          ? 'text-white'
                          : 'text-night'
                    }`
                  : undefined
              }
            >
              {mastery === null ? '–' : mastery.toFixed(2)}
            </span>
          </td>
        );
      })}
    </tr>
  );
});

export function MasteryHeatmap({ topics, rows }: MasteryHeatmapProps) {
  const modern = useModernLook();
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
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${modern ? '' : 'text-sm'}`}
      >
        <span className={modern ? 'text-xs text-night/55' : 'text-muted'}>
          {modern ? 'Per topic, 0 (none) to 1 (full)' : 'Mastery per topic, 0 (none) to 1 (full)'}
        </span>
        <div
          className={`flex items-center gap-2 ${modern ? 'text-xs text-night/55' : 'font-medium'}`}
        >
          <span aria-hidden="true">Sort by</span>
          <Dropdown
            label="Sort by"
            value={sortBy}
            options={[
              { value: 'score', label: 'Score' },
              { value: 'name', label: 'Name' },
            ]}
            onChange={(next) => setSortBy(next as 'score' | 'name')}
            look={modern ? 'modern' : 'default'}
            className={modern ? 'w-24' : 'w-32'}
            triggerClassName={modern ? '!h-8 !text-xs' : 'min-h-8 py-1 text-sm font-normal'}
          />
        </div>
      </div>
      <div className={modern ? 'max-h-64 overflow-y-auto rounded-xl' : undefined}>
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
                <HeatmapRowView
                  key={row.participantId}
                  row={row}
                  topics={stableTopics}
                  modern={modern}
                />
              ))}
            </tbody>
          </table>
        </TableFrame>
      </div>
      {modern ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-night/50">
          <span>Low</span>
          {LEVEL_FILLS.map((fill) => (
            <span key={fill} aria-hidden="true" className={`h-3.5 w-7 rounded-[3px] ${fill}`} />
          ))}
          <span>High</span>
          <span className="ml-2">– no data</span>
        </div>
      ) : (
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
      )}
    </div>
  );
}
