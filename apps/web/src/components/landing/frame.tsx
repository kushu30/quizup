import type { ReactNode } from 'react';
import { useInShell } from '../app/shellContext';

// Dashed rules, after replay.ai: rails either side of the content, full-width section edges,
// and cell dividers that run from rail to rail.
export const RULE = 'border-dashed border-night/15';
export const NIGHT_RULE = 'border-dashed border-white/15';

export function Frame({
  children,
  className = '',
  tone = 'canvas',
  flush = false,
  double = false,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'canvas' | 'night';
  flush?: boolean;
  double?: boolean;
  // A wider frame for pages with a lot to work with side by side, such as the quiz editor.
  wide?: boolean;
}) {
  const rule = tone === 'night' ? NIGHT_RULE : RULE;
  // Beside the app sidebar the rails run full width, one sidebar gap in from each side.
  const width = useInShell() ? 'mx-3' : `mx-auto w-full ${wide ? 'max-w-[84rem]' : 'max-w-6xl'}`;
  const frame = (
    <div
      className={`relative sm:border-x ${width} ${flush ? '' : 'px-4 sm:px-10'} ${rule} ${className}`}
    >
      {children}
    </div>
  );
  if (!double) {
    return frame;
  }
  // A second rail well outside the frame, near the page edge, as on replay.ai's hero.
  return (
    <div className="xl:px-6">
      <div className={`mx-auto max-w-[86rem] xl:border-x ${rule}`}>{frame}</div>
    </div>
  );
}
