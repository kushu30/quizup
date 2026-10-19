interface QuestionTimerProps {
  serverNowMs: number;
  startsAtServerMs: number;
  durationMs: number;
}

export function QuestionTimer({ serverNowMs, startsAtServerMs, durationMs }: QuestionTimerProps) {
  const untilStartMs = startsAtServerMs - serverNowMs;
  if (untilStartMs > 0) {
    return (
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-slate-500">Get ready</p>
        <p className="text-7xl font-bold">{Math.ceil(untilStartMs / 1000)}</p>
      </div>
    );
  }

  const remainingMs = Math.max(startsAtServerMs + durationMs - serverNowMs, 0);
  const fraction = Math.min(remainingMs / durationMs, 1);
  return (
    <div className="space-y-2">
      <p className="text-center text-4xl font-bold">{Math.ceil(remainingMs / 1000)}</p>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-emerald-500" style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}
