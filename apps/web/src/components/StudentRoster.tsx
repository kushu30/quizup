import type { ParticipantPresence } from '@quizup/shared';
import { useId } from 'react';

interface StudentRosterProps {
  participants: ParticipantPresence[];
  size?: 'compact' | 'large';
}

export function StudentRoster({ participants, size = 'compact' }: StudentRosterProps) {
  const headingId = useId();
  const connectedCount = participants.filter((participant) => participant.connected).length;
  const large = size === 'large';

  return (
    <section
      aria-labelledby={headingId}
      className={large ? 'space-y-4' : 'rounded-lg border border-rule bg-surface p-4'}
    >
      <h2
        id={headingId}
        className={`flex flex-wrap items-baseline font-semibold ${large ? 'gap-x-3 text-xl' : 'gap-x-2 text-sm'}`}
      >
        Students
        <span className={`font-normal text-muted tabular-nums ${large ? 'text-base' : ''}`}>
          {connectedCount} connected of {participants.length}
        </span>
      </h2>
      {participants.length === 0 ? (
        <p
          className={
            large
              ? 'rounded-lg border border-dashed border-rule-strong px-5 py-10 text-center text-muted'
              : 'mt-2 text-sm text-muted'
          }
        >
          Nobody has joined yet.{large && ' Names appear here as students join.'}
        </p>
      ) : large ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {participants.map((participant) => (
            <li
              key={participant.participantId}
              className={`flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2.5 ${
                participant.connected
                  ? 'border-rule bg-surface text-ink'
                  : 'border-dashed border-rule bg-paper text-muted'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  participant.connected ? 'bg-success' : 'bg-rule-strong'
                }`}
              />
              <span className="min-w-0 truncate font-medium">{participant.displayName}</span>
              {!participant.connected && <span className="sr-only"> (disconnected)</span>}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
          {participants.map((participant) => (
            <li
              key={participant.participantId}
              title={participant.connected ? undefined : 'Disconnected'}
              className={`max-w-full truncate rounded-md px-2 py-1 text-sm ${
                participant.connected
                  ? 'bg-board-soft text-board'
                  : 'bg-paper text-muted line-through decoration-muted/50'
              }`}
            >
              {participant.displayName}
              {!participant.connected && <span className="sr-only"> (disconnected)</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
