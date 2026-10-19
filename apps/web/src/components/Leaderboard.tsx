import type { LeaderboardEntry } from '@quizup/shared';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  highlightParticipantId?: string;
}

export function Leaderboard({ entries, highlightParticipantId }: LeaderboardProps) {
  if (entries.length === 0) {
    return <p className="text-muted">No scores yet</p>;
  }
  return (
    <ol
      aria-label="Leaderboard"
      className="divide-y divide-rule rounded-lg border border-rule bg-surface"
    >
      {entries.map((entry) => {
        const isYou = entry.participantId === highlightParticipantId;
        return (
          <li
            key={entry.participantId}
            aria-current={isYou ? 'true' : undefined}
            className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
              isYou ? 'bg-marker-soft font-semibold' : ''
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="w-6 shrink-0 text-right text-muted tabular-nums">{entry.rank}</span>
              <span className="truncate">{entry.displayName}</span>
            </span>
            <span className="tabular-nums">{entry.score.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}
