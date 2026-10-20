import {
  PROCTOR_EVENT_BADGE_THRESHOLD,
  PROCTOR_TYPE_LABELS,
  type ParticipantPresence,
  type ProctorEventRecord,
} from '@quizup/shared';
import { useMemo } from 'react';
import { countedProctorEvents } from '../../lib/proctorEvents';
import { StudentDevice } from '../StudentDevice';
import { TableFrame } from '../ui';

interface LiveProctorPanelProps {
  participants: ParticipantPresence[];
  events: readonly ProctorEventRecord[];
  selectedId: string | null;
  onSelect: (participantId: string) => void;
}

export function LiveProctorPanel({
  participants,
  events,
  selectedId,
  onSelect,
}: LiveProctorPanelProps) {
  const byParticipant = useMemo(() => {
    const grouped = new Map<string, ProctorEventRecord[]>();
    for (const event of events) {
      grouped.set(event.participantId, [...(grouped.get(event.participantId) ?? []), event]);
    }
    return grouped;
  }, [events]);

  if (participants.length === 0) {
    return <p className="text-muted">No students yet.</p>;
  }

  return (
    <TableFrame label="Proctor signals">
      <table>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Device</th>
            <th scope="col">Latest signal</th>
            <th scope="col" className="text-right">
              Proctor events
            </th>
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => {
            const own = byParticipant.get(participant.participantId) ?? [];
            const count = countedProctorEvents(own);
            const flagged = count > PROCTOR_EVENT_BADGE_THRESHOLD;
            const latest = [...own]
              .reverse()
              .find((event) => event.type !== 'consent_given' && event.type !== 'focus_return');
            const selected = participant.participantId === selectedId;
            return (
              <tr key={participant.participantId} className={selected ? 'bg-board-soft' : ''}>
                <td>
                  <button
                    type="button"
                    onClick={() => onSelect(participant.participantId)}
                    aria-pressed={selected}
                    className="rounded-sm text-left font-semibold text-board underline decoration-board/30 underline-offset-4 hover:decoration-board"
                  >
                    {participant.displayName}
                  </button>
                </td>
                <td>
                  <StudentDevice devices={participant.devices} />
                </td>
                <td className="text-muted">
                  {latest ? PROCTOR_TYPE_LABELS[latest.type] : 'None yet'}
                </td>
                <td className="text-right">
                  <span
                    title={`${count} proctor events${flagged ? ' (above the highlight threshold)' : ''}`}
                    className={`inline-block min-w-8 rounded-md px-2 py-0.5 text-center text-xs tabular-nums ${
                      flagged ? 'bg-marker font-semibold text-ink' : 'bg-paper text-muted'
                    }`}
                  >
                    {count}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}
