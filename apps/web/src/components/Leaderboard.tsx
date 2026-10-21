import type { LeaderboardEntry } from '@quizup/shared';
import { useModernLook } from './app/shellContext';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  highlightParticipantId?: string;
}

// Podium places get a soft tint; the rest are plain rows.
const PODIUM = [
  'bg-amber-100 text-amber-900',
  'bg-night/[0.07] text-night/70',
  'bg-orange-100 text-orange-900',
];

export function Leaderboard({ entries, highlightParticipantId }: LeaderboardProps) {
  const modern = useModernLook();
  if (entries.length === 0) {
    return <p className={modern ? 'text-night/55' : 'text-muted'}>No scores yet</p>;
  }
  if (modern) {
    const top = Math.max(...entries.map((entry) => entry.score), 1);
    return (
      <ol
        aria-label="Leaderboard"
        className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.09)]"
      >
        {entries.map((entry, index) => {
          const isYou = entry.participantId === highlightParticipantId;
          return (
            <li
              key={entry.participantId}
              aria-current={isYou ? 'true' : undefined}
              className={`relative flex items-center justify-between gap-3 px-3 py-1.5 text-[0.8125rem] ${
                index > 0 ? 'border-t border-dashed border-night/15' : ''
              } ${isYou ? 'bg-night/[0.04] font-medium' : ''}`}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-night/[0.045]"
                style={{ width: `${(entry.score / top) * 100}%` }}
              />
              <span className="relative flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-geist-mono text-[11px] tabular-nums ${
                    PODIUM[entry.rank - 1] ?? 'text-night/45'
                  }`}
                >
                  {entry.rank}
                </span>
                <span className="truncate">{entry.displayName}</span>
              </span>
              <span className="relative font-geist-mono text-xs tabular-nums">
                {entry.score.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ol>
    );
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
