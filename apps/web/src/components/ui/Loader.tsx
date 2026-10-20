import { useEffect, useState } from 'react';

const SLOW_AFTER_MS = 5000;

function LoadingMark({ size = 48 }: { size?: number }) {
  const tiles = [
    { x: 8, y: 8, delay: '0ms' },
    { x: 36, y: 8, delay: '150ms' },
    { x: 36, y: 36, delay: '300ms' },
    { x: 8, y: 36, delay: '450ms' },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="text-board">
      {tiles.map((tile, index) => (
        <rect
          key={`${tile.x}-${tile.y}`}
          x={tile.x}
          y={tile.y}
          width="20"
          height="20"
          rx="6"
          fill={index === 2 ? '#e9b949' : 'currentColor'}
          className="animate-tile"
          style={{
            animationDelay: tile.delay,
            transformOrigin: `${tile.x + 10}px ${tile.y + 10}px`,
          }}
        />
      ))}
    </svg>
  );
}

interface PageLoaderProps {
  label: string;
  compact?: boolean;
}

export function PageLoader({ label, compact = false }: PageLoaderProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      className={`animate-fade-in flex flex-col items-center gap-3 text-center text-muted ${
        compact ? 'py-4' : 'py-16'
      }`}
    >
      <LoadingMark size={compact ? 32 : 48} />
      <p className="text-base">{label}</p>
      {slow && (
        <p className="max-w-xs text-sm">
          This is taking longer than usual. The server may be waking up, so it can take a little
          while.
        </p>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`animate-shimmer rounded-md bg-rule ${className}`.trim()} />
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          data-skeleton-row
          className="flex items-center justify-between gap-4 rounded-lg border border-rule bg-surface p-5"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
      ))}
    </div>
  );
}
