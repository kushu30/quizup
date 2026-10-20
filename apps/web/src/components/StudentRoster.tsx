import type { ParticipantPresence } from '@quizup/shared';
import { useId, useState } from 'react';

interface StudentRosterProps {
  participants: ParticipantPresence[];
  size?: 'compact' | 'large';
  onLetBackIn?: (participantId: string) => Promise<void>;
}

export function StudentRoster({ participants, size = 'compact', onLetBackIn }: StudentRosterProps) {
  const headingId = useId();
  const connectedCount = participants.filter((participant) => participant.connected).length;
  const large = size === 'large';
  const [reopened, setReopened] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);

  async function letBackIn(participantId: string) {
    setFailed(false);
    try {
      await onLetBackIn?.(participantId);
      setReopened((current) => new Set(current).add(participantId));
    } catch {
      setFailed(true);
    }
  }

  function reopenControl(participant: ParticipantPresence) {
    if (!onLetBackIn || participant.connected) {
      return null;
    }
    if (reopened.has(participant.participantId)) {
      return <span className="text-xs text-muted">Open for 5 minutes</span>;
    }
    return (
      <button
        type="button"
        aria-label={`Let ${participant.displayName} back in`}
        onClick={() => void letBackIn(participant.participantId)}
        className="shrink-0 rounded border border-rule-strong bg-surface px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper"
      >
        Let back in
      </button>
    );
  }

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
              {reopenControl(participant)}
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
              {onLetBackIn && !participant.connected && ' '}
              {reopenControl(participant)}
            </li>
          ))}
        </ul>
      )}
      {failed && (
        <p role="alert" className="text-sm font-medium text-alert">
          Could not reopen that seat. Try again.
        </p>
      )}
    </section>
  );
}
