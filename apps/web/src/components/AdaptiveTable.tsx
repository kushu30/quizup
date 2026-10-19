import type { AdaptiveRow } from '@quizup/shared';

interface AdaptiveTableProps {
  rows: AdaptiveRow[];
}

export function AdaptiveTable({ rows }: AdaptiveTableProps) {
  if (rows.length === 0) {
    return <p className="text-slate-500">No students yet</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-2">Student</th>
            <th className="px-4 py-2">Rating</th>
            <th className="px-4 py-2">Last question</th>
            <th className="px-4 py-2">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={row.participantId}>
              <td className="px-4 py-2">{row.displayName}</td>
              <td className="px-4 py-2">{Math.round(row.rating)}</td>
              <td className="px-4 py-2">{row.lastDifficulty ?? '-'}</td>
              <td className="px-4 py-2">
                {row.lastCorrect === null ? '-' : row.lastCorrect ? 'Correct' : 'Wrong'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
