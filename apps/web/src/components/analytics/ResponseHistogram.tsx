import { useState } from 'react';

interface ResponseHistogramProps {
  currentCounts: number[];
  sessionCounts: number[];
  currentLabel: string;
}

const BUCKET_LABELS = [
  '0-10%',
  '10-20%',
  '20-30%',
  '30-40%',
  '40-50%',
  '50-60%',
  '60-70%',
  '70-80%',
  '80-90%',
  '90-100%',
];

export function ResponseHistogram({
  currentCounts,
  sessionCounts,
  currentLabel,
}: ResponseHistogramProps) {
  const [scope, setScope] = useState<'current' | 'session'>('current');
  const counts = scope === 'current' ? currentCounts : sessionCounts;
  const total = counts.reduce((sum, count) => sum + count, 0);
  const tallest = Math.max(...counts, 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Histogram scope"
          className="inline-flex rounded-md border border-rule-strong p-0.5 text-sm"
        >
          {(
            [
              ['current', currentLabel],
              ['session', 'Whole session'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={`min-h-8 rounded px-3 font-medium ${
                scope === value ? 'bg-ink text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted tabular-nums">{total} responses</span>
      </div>
      <div
        className="flex h-40 items-end gap-1 border-b border-rule-strong"
        role="img"
        aria-label={`Response time distribution, ${total} responses`}
      >
        {counts.map((count, index) => (
          <div key={BUCKET_LABELS[index]} className="flex h-full flex-1 flex-col justify-end">
            <span className="text-center text-xs text-muted tabular-nums">{count}</span>
            <div
              title={`${BUCKET_LABELS[index]} of the time limit: ${count}`}
              className="w-full rounded-t-sm bg-board"
              style={{ height: `${(count / tallest) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="hidden gap-1 sm:flex">
        {BUCKET_LABELS.map((label) => (
          <span key={label} className="flex-1 text-center text-[11px] text-muted">
            {label}
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between text-xs text-muted sm:hidden">
        <span>0%</span>
        <span>100%</span>
      </div>
      <p className="text-xs text-muted">Share of the question time limit used before answering.</p>
    </div>
  );
}
