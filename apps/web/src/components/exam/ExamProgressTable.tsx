import { PROCTOR_EVENT_BADGE_THRESHOLD, type ExamProgressRow } from '@quizup/shared';
import { memo } from 'react';
import { useServerNow } from '../../hooks/useServerNow';
import { useStableRows } from '../../lib/stableRows';
import { TableFrame } from '../ui';

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
    <tr className={selected ? 'bg-board-soft' : ''}>
      <td>
        <button
          type="button"
          onClick={() => onSelect(row.participantId)}
          className="rounded-sm text-left font-semibold text-board underline decoration-board/30 underline-offset-4 hover:decoration-board"
          aria-pressed={selected}
        >
          {row.displayName}
        </button>
      </td>
      <td className="whitespace-nowrap">{STATUS_LABELS[row.status]}</td>
      <td className="text-right tabular-nums">
        {row.answered}/{row.totalQuestions}
      </td>
      <td className="text-right">
        {row.status === 'in_progress' && row.deadlineAtServerMs !== null ? (
          <RemainingTime deadlineAtServerMs={row.deadlineAtServerMs} offsetMs={offsetMs} />
        ) : (
          '-'
        )}
      </td>
      <td className="text-right">
        <span
          title={`${row.proctorEventCount} proctor events${flagged ? ' (above the highlight threshold)' : ''}`}
          className={`inline-block min-w-8 rounded-md px-2 py-0.5 text-center text-xs tabular-nums ${
            flagged ? 'bg-marker font-semibold text-ink' : 'bg-paper text-muted'
          }`}
        >
          {row.proctorEventCount}
        </span>
      </td>
      <td className="text-right tabular-nums">{row.score === null ? '-' : row.score}</td>
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
    return <p className="text-muted">No students yet.</p>;
  }
  return (
    <TableFrame label="Exam progress">
      <table>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Status</th>
            <th scope="col" className="text-right">
              Answered
            </th>
            <th scope="col" className="text-right">
              Time left
            </th>
            <th scope="col" className="text-right">
              Proctor events
            </th>
            <th scope="col" className="text-right">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
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
    </TableFrame>
  );
}
