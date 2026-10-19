import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-paper text-muted ring-1 ring-inset ring-rule',
  brand: 'bg-board-soft text-board',
  success: 'bg-success-soft text-success',
  warning: 'bg-marker-soft text-marker-ink',
  danger: 'bg-alert-soft text-alert',
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
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_TONES[tone]}`}
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

export function Notice({
  tone = 'info',
  children,
  className = '',
}: {
  tone?: NoticeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-md px-3 py-2 text-sm ${NOTICE_TONES[tone]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
