import type { LeaderboardEntry } from '@quizup/shared';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  highlightParticipantId?: string;
}

export function Leaderboard({ entries, highlightParticipantId }: LeaderboardProps) {
  if (entries.length === 0) {
    return <p className="text-slate-500">No scores yet</p>;
  }
  return (
    <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {entries.map((entry) => (
        <li
          key={entry.participantId}
          className={`flex items-center justify-between px-4 py-2 ${
            entry.participantId === highlightParticipantId ? 'bg-amber-50 font-semibold' : ''
          }`}
        >
          <span>
            <span className="mr-3 inline-block w-6 text-slate-500">{entry.rank}</span>
            {entry.displayName}
          </span>
          <span>{entry.score}</span>
        </li>
      ))}
    </ol>
  );
}
