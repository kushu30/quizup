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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div role="group" aria-label="Histogram scope" className="flex gap-1 text-sm">
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
              className={`rounded-md border px-3 py-1 ${
                scope === value
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-600 dark:text-slate-300">{total} responses</span>
      </div>
      <div
        className="flex h-40 items-end gap-1"
        role="img"
        aria-label={`Response time distribution, ${total} responses`}
      >
        {counts.map((count, index) => (
          <div key={BUCKET_LABELS[index]} className="flex h-full flex-1 flex-col justify-end">
            <span className="text-center text-xs tabular-nums">{count}</span>
            <div
              title={`${BUCKET_LABELS[index]} of the time limit: ${count}`}
              className="w-full rounded-t bg-blue-500 dark:bg-blue-400"
              style={{ height: `${(count / tallest) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {BUCKET_LABELS.map((label) => (
          <span key={label} className="flex-1 text-center text-[10px] text-slate-500">
            {label}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Share of the question time limit used before answering.
      </p>
    </div>
  );
}
