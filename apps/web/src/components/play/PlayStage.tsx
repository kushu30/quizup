import type { ReactNode } from 'react';
import { useBrand } from '../../lib/brandContext';
import { initialsOf } from '../branding/BrandMark';

// The surface every student screen sits on: the woven texture of the landing hero, with the
// content in a centred column of white cards, so a quiz feels like the same product as the site.

export const CARD =
  'rounded-2xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_1px_3px_rgba(17,16,20,0.05)]';

const WIDTHS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-3xl' } as const;

export function PlayStage({
  children,
  width = 'md',
  className = '',
}: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  className?: string;
}) {
  // An institution's faint tint, set on the page behind, shows through the texture.
  const { branding } = useBrand();
  return (
    <section
      className="texture-weave flex flex-1 flex-col"
      style={branding?.brandColor ? { backgroundColor: 'transparent' } : undefined}
    >
      <div
        className={`mx-auto w-full flex-1 space-y-4 px-4 py-6 sm:py-10 ${WIDTHS[width]} ${className}`}
      >
        {children}
      </div>
    </section>
  );
}

// Who is playing, and where they stand: a thin card above whatever is on screen.
export function PlayerBar({
  name,
  standing,
}: {
  name: string;
  standing: { rank: number; score: number } | null;
}) {
  return (
    <div className={`${CARD} flex items-center justify-between gap-3 px-4 py-2.5`}>
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-night text-[11px] font-medium text-white"
        >
          {initialsOf(name) || '·'}
        </span>
        <span className="min-w-0 truncate text-sm font-medium">{name}</span>
      </span>
      {standing && (
        <span className="shrink-0 font-geist-mono text-xs text-night/60 tabular-nums">
          Rank {standing.rank}, {standing.score.toLocaleString()} points
        </span>
      )}
    </div>
  );
}

// Three dots that breathe, for "waiting for the host".
export function WaitingDots() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1.5">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-1.5 w-1.5 animate-live rounded-full bg-night/50"
          style={{ animationDelay: `${dot * 180}ms` }}
        />
      ))}
    </span>
  );
}
