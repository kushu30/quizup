interface LiveIndicatorProps {
  connected: boolean;
}

export function LiveIndicator({ connected }: LiveIndicatorProps) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        connected
          ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`}
      />
      {connected ? 'Live' : 'Reconnecting'}
    </span>
  );
}
