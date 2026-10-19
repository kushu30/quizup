import type { ParticipantAnalytics } from '@quizup/shared';
import { memo } from 'react';
import { MIN_CONFIDENT_SAMPLE, MIN_PROJECTION_SAMPLE } from '@quizup/shared';
import { useStableRows } from '../../lib/stableRows';
import { Badge, TableFrame } from '../ui';

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
      <td className="text-muted tabular-nums">{participant.rank}</td>
      <td className="font-medium">{participant.displayName}</td>
      <td className="text-right tabular-nums">{participant.score.toLocaleString()}</td>
      <td className="text-right tabular-nums">
        {participant.correct}/{participant.answered}
      </td>
      <td>
        {projection ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            Projected {Math.round(projection.projected).toLocaleString()}
            {projection.lowConfidence && (
              <Badge tone="warning" title={lowConfidenceHint(adaptive, projection.n)}>
                low confidence
              </Badge>
            )}
          </span>
        ) : (
          <span
            title={`Needs ${MIN_PROJECTION_SAMPLE} answers and a known number of rounds`}
            className="text-muted"
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
    return <p className="text-muted">No students yet.</p>;
  }
  return (
    <TableFrame label="Students and projected final score table">
      <table>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Student</th>
            <th scope="col" className="text-right">
              Score
            </th>
            <th scope="col" className="text-right">
              Correct
            </th>
            <th scope="col">Projected final score</th>
          </tr>
        </thead>
        <tbody>
          {stableParticipants.map((participant) => (
            <ParticipantRow
              key={participant.participantId}
              participant={participant}
              adaptive={adaptive}
            />
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
