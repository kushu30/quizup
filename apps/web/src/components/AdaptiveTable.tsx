import type { AdaptiveRow } from '@quizup/shared';
import { TableFrame } from './ui';

interface AdaptiveTableProps {
  rows: AdaptiveRow[];
}

export function AdaptiveTable({ rows }: AdaptiveTableProps) {
  if (rows.length === 0) {
    return <p className="text-muted">No students yet</p>;
  }
  return (
    <TableFrame label="Students in this adaptive session">
      <table>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col" className="text-right">
              Rating
            </th>
            <th scope="col">Last question</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.participantId}>
              <td className="font-medium">{row.displayName}</td>
              <td className="text-right tabular-nums">{Math.round(row.rating)}</td>
              <td className="capitalize">{row.lastDifficulty ?? '-'}</td>
              <td
                className={
                  row.lastCorrect === null
                    ? 'text-muted'
                    : row.lastCorrect
                      ? 'font-medium text-success'
                      : 'font-medium text-alert'
                }
              >
                {row.lastCorrect === null ? '-' : row.lastCorrect ? 'Correct' : 'Wrong'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
