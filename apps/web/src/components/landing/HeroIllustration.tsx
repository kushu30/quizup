const OPTIONS = [
  { letter: 'A', text: 'Read committed', tone: 'bg-answer-a text-white', picked: true },
  { letter: 'B', text: 'Read uncommitted', tone: 'bg-answer-b text-white', picked: false },
  { letter: 'C', text: 'Serializable', tone: 'bg-answer-c text-ink', picked: false },
  { letter: 'D', text: 'Repeatable read', tone: 'bg-answer-d text-white', picked: false },
];

const STANDINGS = [
  { rank: 1, name: 'Asha', score: '4,820' },
  { rank: 2, name: 'Ben', score: '4,310' },
  { rank: 3, name: 'Chen', score: '3,975' },
];

export function HeroIllustration() {
  return (
    <figure aria-hidden="true" className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-rule bg-surface p-5 pb-12 shadow-sm sm:p-6 sm:pb-14">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-lg bg-board px-3 py-1.5 text-2xl leading-none font-bold text-white tabular-nums">
            11:42
          </span>
          <span className="text-sm font-medium text-muted tabular-nums">3 of 10 answered</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule">
          <div className="h-full w-[62%] rounded-full bg-board" />
        </div>
        <p className="mt-5 text-lg leading-snug font-semibold text-ink">
          Which isolation level prevents dirty reads but allows non-repeatable reads?
        </p>
        <ul className="mt-4 grid gap-2">
          {OPTIONS.map((option) => (
            <li
              key={option.letter}
              className={`flex items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-sm ${
                option.picked ? 'border-board bg-board-soft' : 'border-rule bg-surface'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${option.tone}`}
              >
                {option.letter}
              </span>
              {option.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative -mt-9 ml-auto mr-3 w-56 rounded-xl border border-rule bg-surface p-4 shadow-md sm:mr-6">
        <p className="text-sm font-semibold">Leaderboard</p>
        <ol className="mt-2 space-y-1.5 text-sm">
          {STANDINGS.map((row) => (
            <li key={row.rank} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-marker text-[11px] font-bold text-ink">
                  {row.rank}
                </span>
                {row.name}
              </span>
              <span className="text-muted tabular-nums">{row.score}</span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-2 text-right text-xs text-muted">Illustration</figcaption>
    </figure>
  );
}
