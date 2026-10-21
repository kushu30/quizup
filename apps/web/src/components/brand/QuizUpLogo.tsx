import { useId } from 'react';

export type LogoTone = 'color' | 'onDark' | 'mono';

const INK = '#111014';

// The mark is a squared Q built from answer tiles: a tile with a square counter, and a
// separate accent tile breaking out of its corner as the tail, like a selected answer.
// The tail follows the site accent colour, with violet as the fallback.
const TILE_COLOR: Record<LogoTone, string> = {
  color: INK,
  onDark: '#ffffff',
  mono: 'currentColor',
};

const TAIL_COLOR: Record<LogoTone, string> = {
  color: 'var(--color-accent-500, #7d64f0)',
  onDark: 'var(--color-accent-400, #a08cfa)',
  mono: 'currentColor',
};

const WORD_COLOR: Record<LogoTone, string> = {
  color: 'text-[#111014]',
  onDark: 'text-white',
  mono: 'text-current',
};

interface LogoMarkProps {
  size?: number;
  tone?: LogoTone;
  className?: string;
}

export function LogoMark({ size = 32, tone = 'color', className = '' }: LogoMarkProps) {
  const maskId = `quizup-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`shrink-0 ${className}`.trim()}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <rect x="15" y="15" width="17" height="17" rx="4.5" fill="#000" />
        <rect x="31" y="31" width="33" height="33" rx="12" fill="#000" />
      </mask>
      <rect
        data-part="tile"
        x="4"
        y="4"
        width="44"
        height="44"
        rx="13"
        fill={TILE_COLOR[tone]}
        mask={`url(#${maskId})`}
      />
      <rect
        data-part="tail"
        x="36"
        y="36"
        width="24"
        height="24"
        rx="8"
        style={{ fill: TAIL_COLOR[tone] }}
      />
    </svg>
  );
}

interface QuizUpLogoProps {
  size?: number;
  tone?: LogoTone;
  wordmark?: boolean;
  className?: string;
}

export function QuizUpLogo({
  size = 28,
  tone = 'color',
  wordmark = true,
  className = '',
}: QuizUpLogoProps) {
  return (
    <span
      role="img"
      aria-label="QuizUp"
      className={`inline-flex items-center leading-none ${className}`.trim()}
      style={{ gap: size * 0.3 }}
    >
      <LogoMark size={size} tone={tone} />
      {wordmark && (
        <span
          aria-hidden="true"
          className={`font-geist font-semibold tracking-[-0.045em] ${WORD_COLOR[tone]}`}
          style={{ fontSize: size * 0.78 }}
        >
          Quiz<span data-part="up">Up</span>
        </span>
      )}
    </span>
  );
}
