import { PROCTOR_EVENT_BADGE_THRESHOLD, type ExamProgressRow } from '@quizup/shared';
import { memo } from 'react';
import { useServerNow } from '../../hooks/useServerNow';
import { useStableRows } from '../../lib/stableRows';

interface ExamProgressTableProps {
  rows: ExamProgressRow[];
  offsetMs: number;
  selectedId: string | null;
  onSelect: (participantId: string) => void;
}

const STATUS_LABELS: Record<ExamProgressRow['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
};

function RemainingTime({
  deadlineAtServerMs,
  offsetMs,
}: {
  deadlineAtServerMs: number;
  offsetMs: number;
}) {
  const serverNowMs = useServerNow(offsetMs);
  const remainingSeconds = Math.max(Math.ceil((deadlineAtServerMs - serverNowMs) / 1000), 0);
  return (
    <span className="tabular-nums">
      {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}
    </span>
  );
}

const ProgressRowView = memo(function ProgressRowView({
  row,
  offsetMs,
  selected,
  onSelect,
}: {
  row: ExamProgressRow;
  offsetMs: number;
  selected: boolean;
  onSelect: (participantId: string) => void;
}) {
  const flagged = row.proctorEventCount > PROCTOR_EVENT_BADGE_THRESHOLD;
  return (
    <tr className={selected ? 'bg-slate-100 dark:bg-slate-800' : ''}>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => onSelect(row.participantId)}
          className="font-medium underline-offset-2 hover:underline"
          aria-pressed={selected}
        >
          {row.displayName}
        </button>
      </td>
      <td className="px-3 py-2">{STATUS_LABELS[row.status]}</td>
      <td className="px-3 py-2 tabular-nums">
        {row.answered}/{row.totalQuestions}
      </td>
      <td className="px-3 py-2">
        {row.status === 'in_progress' && row.deadlineAtServerMs !== null ? (
          <RemainingTime deadlineAtServerMs={row.deadlineAtServerMs} offsetMs={offsetMs} />
        ) : (
          '-'
        )}
      </td>
      <td className="px-3 py-2">
        <span
          title={`${row.proctorEventCount} proctor events${flagged ? ' (above the highlight threshold)' : ''}`}
          className={`inline-block min-w-8 rounded-full px-2 py-0.5 text-center text-xs tabular-nums ${
            flagged
              ? 'bg-amber-200 font-semibold text-amber-950'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
          }`}
        >
          {row.proctorEventCount}
        </span>
      </td>
      <td className="px-3 py-2 tabular-nums">{row.score === null ? '-' : row.score}</td>
    </tr>
  );
});

export function ExamProgressTable({
  rows,
  offsetMs,
  selectedId,
  onSelect,
}: ExamProgressTableProps) {
  const stableRows = useStableRows(rows, (row) => row.participantId);
  if (stableRows.length === 0) {
    return <p className="text-slate-500">No students yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <tr>
            <th className="px-3 py-2">Student</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Answered</th>
            <th className="px-3 py-2">Time left</th>
            <th className="px-3 py-2">Proctor events</th>
            <th className="px-3 py-2">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {stableRows.map((row) => (
            <ProgressRowView
              key={row.participantId}
              row={row}
              offsetMs={offsetMs}
              selected={row.participantId === selectedId}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
