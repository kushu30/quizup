import type { ParticipantAnalytics } from '@quizup/shared';
import { memo } from 'react';
import { MIN_CONFIDENT_SAMPLE, MIN_PROJECTION_SAMPLE } from '@quizup/shared';
import { useStableRows } from '../../lib/stableRows';

interface ProjectionTableProps {
  participants: ParticipantAnalytics[];
  adaptive: boolean;
}

function lowConfidenceHint(adaptive: boolean, n: number): string {
  return adaptive
    ? 'Adaptive sessions give each student different questions, so projections are always low confidence.'
    : `Based on ${n} answers. Projections need ${MIN_CONFIDENT_SAMPLE} answers to be confident.`;
}

const ParticipantRow = memo(function ParticipantRow({
  participant,
  adaptive,
}: {
  participant: ParticipantAnalytics;
  adaptive: boolean;
}) {
  const { projection } = participant;
  return (
    <tr>
      <td className="px-3 py-2 tabular-nums">{participant.rank}</td>
      <td className="px-3 py-2">{participant.displayName}</td>
      <td className="px-3 py-2 tabular-nums">{participant.score.toLocaleString()}</td>
      <td className="px-3 py-2 tabular-nums">
        {participant.correct}/{participant.answered}
      </td>
      <td className="px-3 py-2">
        {projection ? (
          <span>
            Projected {Math.round(projection.projected).toLocaleString()}
            {projection.lowConfidence && (
              <span
                title={lowConfidenceHint(adaptive, projection.n)}
                className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              >
                low confidence
              </span>
            )}
          </span>
        ) : (
          <span
            title={`Needs ${MIN_PROJECTION_SAMPLE} answers and a known number of rounds`}
            className="text-slate-400"
          >
            -
          </span>
        )}
      </td>
    </tr>
  );
});

export function ProjectionTable({ participants, adaptive }: ProjectionTableProps) {
  const stableParticipants = useStableRows(
    participants,
    (participant) => participant.participantId,
  );
  if (stableParticipants.length === 0) {
    return <p className="text-slate-500">No students yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <tr>
            <th className="px-3 py-2">Rank</th>
            <th className="px-3 py-2">Student</th>
            <th className="px-3 py-2">Score</th>
            <th className="px-3 py-2">Correct</th>
            <th className="px-3 py-2">Projected final score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {stableParticipants.map((participant) => (
            <ParticipantRow
              key={participant.participantId}
              participant={participant}
              adaptive={adaptive}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
