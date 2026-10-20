export type LogoTone = 'color' | 'onDark' | 'mono';

const AMBER = '#e9b949';
const INK = '#1c2533';
const PAPER = '#f7f8fa';

const MARK_COLOR: Record<LogoTone, string> = {
  color: 'text-board',
  onDark: 'text-paper',
  mono: 'text-current',
};

const WORD_COLOR: Record<LogoTone, string> = {
  color: 'text-ink',
  onDark: 'text-paper',
  mono: 'text-current',
};

const UP_COLOR: Record<LogoTone, string> = {
  color: 'text-board',
  onDark: 'text-marker',
  mono: 'text-current',
};

interface LogoMarkProps {
  size?: number;
  tone?: LogoTone;
  knock?: string;
  className?: string;
}

export function LogoMark({
  size = 32,
  tone = 'color',
  knock = PAPER,
  className = '',
}: LogoMarkProps) {
  const mono = tone === 'mono';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`shrink-0 ${MARK_COLOR[tone]} ${className}`.trim()}
    >
      <rect
        x="8"
        y="8"
        width="20"
        height="20"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <rect
        x="36"
        y="8"
        width="20"
        height="20"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <rect
        x="8"
        y="36"
        width="20"
        height="20"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <rect x="34" y="34" width="24" height="24" rx="7" fill={mono ? 'currentColor' : AMBER} />
      <path
        d="M41 46 L45.5 50.5 L52 41.5"
        fill="none"
        stroke={mono ? knock : INK}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface QuizUpLogoProps {
  size?: number;
  tone?: LogoTone;
  wordmark?: boolean;
  knock?: string;
  className?: string;
}

export function QuizUpLogo({
  size = 28,
  tone = 'color',
  wordmark = true,
  knock,
  className = '',
}: QuizUpLogoProps) {
  return (
    <span
      role="img"
      aria-label="QuizUp"
      className={`inline-flex items-center leading-none ${className}`.trim()}
      style={{ gap: size * 0.28 }}
    >
      <LogoMark size={size} tone={tone} knock={knock} />
      {wordmark && (
        <span
          aria-hidden="true"
          className={`font-extrabold tracking-[-0.03em] ${WORD_COLOR[tone]}`}
          style={{ fontSize: size * 0.72 }}
        >
          Quiz
          <span data-part="up" className={UP_COLOR[tone]}>
            Up
          </span>
        </span>
      )}
    </span>
  );
}
