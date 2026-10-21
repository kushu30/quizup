import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useInShell } from '../app/shellContext';

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="mb-8 space-y-3">
      {back && (
        <Link
          to={back.to}
          className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-title font-semibold tracking-tight break-words">{title}</h1>
          {description && <p className="max-w-prose text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  level = 2,
  className = '',
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  const modern = useInShell();
  const frame = (
    modern
      ? `rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_1px_3px_rgba(17,16,20,0.05)] sm:p-5 ${className}`
      : `rounded-lg border border-rule bg-surface p-5 ${className}`
  ).trim();

  if (!title) {
    return <div className={frame}>{children}</div>;
  }
  return (
    <section aria-labelledby={headingId} className={frame}>
      <div
        className={`flex flex-wrap items-start justify-between gap-3 ${modern ? 'mb-3' : 'mb-4'}`}
      >
        <div className="min-w-0 space-y-1">
          <Heading
            id={headingId}
            className={
              modern
                ? 'text-base font-medium tracking-tight'
                : 'text-xl font-semibold tracking-tight'
            }
          >
            {title}
          </Heading>
          {description && (
            <p className={`text-sm ${modern ? 'text-night/55' : 'text-muted'}`}>{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

const MODERN_TABLE_STYLES =
  'relative overflow-x-auto rounded-xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.09)] [&_table]:w-full [&_table]:text-left [&_table]:text-[0.8125rem] [&_th]:px-3 [&_th]:py-2 [&_th]:text-[0.6875rem] [&_th]:font-medium [&_th]:text-night/45 [&_thead]:border-b [&_thead]:border-dashed [&_thead]:border-night/15 [&_thead]:bg-night/[0.02] [&_td]:px-3 [&_td]:py-2 [&_tbody_tr]:border-t [&_tbody_tr]:border-dashed [&_tbody_tr]:border-night/15 [&_tbody_tr:first-child]:border-t-0 [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-200 [&_tbody_tr:hover]:bg-canvas/70';

const TABLE_STYLES =
  'relative overflow-x-auto rounded-lg border border-rule bg-surface [&_table]:w-full [&_table]:text-left [&_table]:text-sm [&_thead]:bg-paper [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-medium [&_th]:text-muted [&_td]:px-3 [&_td]:py-2.5 [&_tbody_tr]:border-t [&_tbody_tr]:border-rule';

export function TableFrame({ label, children }: { label?: string; children: ReactNode }) {
  const styles = useInShell() ? MODERN_TABLE_STYLES : TABLE_STYLES;
  return label ? (
    <div role="region" aria-label={label} tabIndex={0} className={styles}>
      {children}
    </div>
  ) : (
    <div className={styles}>{children}</div>
  );
}
