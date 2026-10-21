import { useInShell } from './app/shellContext';

interface QuestionTimerProps {
  serverNowMs: number;
  startsAtServerMs: number;
  durationMs: number;
}

const URGENT_FRACTION = 0.25;

export function QuestionTimer({ serverNowMs, startsAtServerMs, durationMs }: QuestionTimerProps) {
  const modern = useInShell();
  const untilStartMs = startsAtServerMs - serverNowMs;
  if (untilStartMs > 0) {
    return (
      <div className="text-center">
        <p className={`text-base font-medium ${modern ? 'text-night/55' : 'text-muted'}`}>
          Get ready
        </p>
        <p
          className={`font-bold tabular-nums ${
            modern ? 'font-geist-mono text-4xl tracking-tight' : 'text-display'
          }`}
        >
          {Math.ceil(untilStartMs / 1000)}
        </p>
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
        className={`text-center font-bold tabular-nums ${
          modern ? 'font-geist-mono text-4xl tracking-tight' : 'text-hero'
        } ${urgent ? (modern ? 'text-alert' : 'text-marker-ink') : ''}`}
      >
        {secondsLeft}
      </p>
      <div
        role="progressbar"
        aria-label="Time left"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={secondsLeft}
        className={`${modern ? 'h-1.5' : 'h-2.5'} overflow-hidden rounded-full ${modern ? 'bg-night/[0.08]' : 'bg-rule'}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${
            urgent ? (modern ? 'bg-alert' : 'bg-marker') : modern ? 'bg-night/70' : 'bg-board'
          }`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}

// The same countdown in one line, for the host console: a thin bar and the seconds beside it.
export function InlineTimer({ serverNowMs, startsAtServerMs, durationMs }: QuestionTimerProps) {
  const untilStartMs = startsAtServerMs - serverNowMs;
  if (untilStartMs > 0) {
    return (
      <span className="text-sm text-night/55">
        Starts in{' '}
        <span className="font-geist-mono font-medium text-night tabular-nums">
          {Math.ceil(untilStartMs / 1000)}
        </span>
      </span>
    );
  }
  const remainingMs = Math.max(startsAtServerMs + durationMs - serverNowMs, 0);
  const fraction = Math.min(remainingMs / durationMs, 1);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const urgent = fraction <= URGENT_FRACTION;
  return (
    <span className="flex items-center gap-3">
      <span
        role="progressbar"
        aria-label="Time left"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={secondsLeft}
        className="h-1.5 w-24 overflow-hidden rounded-full bg-night/[0.08] sm:w-32"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-100 ${
            urgent ? 'bg-alert' : 'bg-night/70'
          }`}
          style={{ width: `${fraction * 100}%` }}
        />
      </span>
      <span
        aria-hidden="true"
        className={`w-10 text-right font-geist-mono text-2xl leading-none font-medium tabular-nums ${
          urgent ? 'text-alert' : 'text-night'
        }`}
      >
        {secondsLeft}
      </span>
    </span>
  );
}
