interface QuestionTimerProps {
  serverNowMs: number;
  startsAtServerMs: number;
  durationMs: number;
}

const URGENT_FRACTION = 0.25;

export function QuestionTimer({ serverNowMs, startsAtServerMs, durationMs }: QuestionTimerProps) {
  const untilStartMs = startsAtServerMs - serverNowMs;
  if (untilStartMs > 0) {
    return (
      <div className="text-center">
        <p className="text-base font-medium text-muted">Get ready</p>
        <p className="text-display font-bold tabular-nums">{Math.ceil(untilStartMs / 1000)}</p>
      </div>
    );
  }

  const remainingMs = Math.max(startsAtServerMs + durationMs - serverNowMs, 0);
  const fraction = Math.min(remainingMs / durationMs, 1);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const urgent = fraction <= URGENT_FRACTION;

  return (
    <div className="space-y-2">
      <p
        aria-hidden="true"
        className={`text-center text-hero font-bold tabular-nums ${urgent ? 'text-marker-ink' : ''}`}
      >
        {secondsLeft}
      </p>
      <div
        role="progressbar"
        aria-label="Time left"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={secondsLeft}
        className="h-2.5 overflow-hidden rounded-full bg-rule"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${urgent ? 'bg-marker' : 'bg-board'}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
