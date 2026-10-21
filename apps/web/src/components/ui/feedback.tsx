import type { ReactNode } from 'react';
import { useInShell } from '../app/shellContext';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-paper text-muted ring-1 ring-inset ring-rule',
  brand: 'bg-board-soft text-board',
  success: 'bg-success-soft text-success',
  warning: 'bg-marker-soft text-marker-ink',
  danger: 'bg-alert-soft text-alert',
};

const MODERN_BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-night/[0.05] text-night/65',
  brand: 'bg-accent-50 text-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent-200)]',
  success: 'bg-accent-50 text-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent-200)]',
  warning: 'bg-amber-50 text-amber-900 shadow-[inset_0_0_0_1px_var(--color-amber-200)]',
  danger: 'bg-alert-soft text-alert shadow-[inset_0_0_0_1px_rgba(180,35,24,0.18)]',
};

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
}) {
  const modern = useInShell();
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap ${
        modern
          ? `rounded-lg px-2.5 py-1 text-[0.8125rem] font-medium ${MODERN_BADGE_TONES[tone]}`
          : `rounded px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`
      }`}
    >
      {children}
    </span>
  );
}

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: 'bg-board-soft text-board',
  success: 'bg-success-soft text-success',
  warning: 'bg-marker-soft text-marker-ink',
  danger: 'bg-alert-soft text-alert',
};

const MODERN_NOTICE_TONES: Record<NoticeTone, string> = {
  info: 'bg-night/[0.04] text-night/80 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.08)]',
  success: 'bg-night/[0.04] text-night/80 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.08)]',
  warning: 'bg-amber-50 text-amber-900 shadow-[inset_0_0_0_1px_var(--color-amber-200)]',
  danger: 'bg-alert-soft text-alert shadow-[inset_0_0_0_1px_rgba(180,35,24,0.18)]',
};

export function Notice({
  tone = 'info',
  children,
  className = '',
}: {
  tone?: NoticeTone;
  children: ReactNode;
  className?: string;
}) {
  const modern = useInShell();
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`text-sm ${
        modern
          ? `rounded-xl px-4 py-3 leading-relaxed ${MODERN_NOTICE_TONES[tone]}`
          : `rounded-md px-3 py-2 ${NOTICE_TONES[tone]}`
      } ${className}`.trim()}
    >
      {children}
    </div>
  );
}
