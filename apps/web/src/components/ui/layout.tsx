import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

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
  const frame = `rounded-lg border border-rule bg-surface p-5 ${className}`.trim();

  if (!title) {
    return <div className={frame}>{children}</div>;
  }
  return (
    <section aria-labelledby={headingId} className={frame}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Heading id={headingId} className="text-xl font-semibold tracking-tight">
            {title}
          </Heading>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

const TABLE_STYLES =
  'relative overflow-x-auto rounded-lg border border-rule bg-surface [&_table]:w-full [&_table]:text-left [&_table]:text-sm [&_thead]:bg-paper [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-medium [&_th]:text-muted [&_td]:px-3 [&_td]:py-2.5 [&_tbody_tr]:border-t [&_tbody_tr]:border-rule';

export function TableFrame({ label, children }: { label?: string; children: ReactNode }) {
  return label ? (
    <div role="region" aria-label={label} tabIndex={0} className={TABLE_STYLES}>
      {children}
    </div>
  ) : (
    <div className={TABLE_STYLES}>{children}</div>
  );
}
