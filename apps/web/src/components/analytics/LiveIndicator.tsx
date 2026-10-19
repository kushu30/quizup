interface LiveIndicatorProps {
  connected: boolean;
}

export function LiveIndicator({ connected }: LiveIndicatorProps) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold ${
        connected ? 'bg-success-soft text-success' : 'bg-marker-soft text-marker-ink'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${connected ? 'bg-success' : 'animate-pulse bg-marker'}`}
      />
      {connected ? 'Live' : 'Reconnecting'}
    </span>
  );
}
