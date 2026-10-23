export type PillStatus = 'waiting' | 'live' | 'ended';

// Built from the same recipe as the solid buttons in landing/cta.ts: softly rounded corners, a
// vertical gradient, an inner top highlight and a thin darker edge. Each state has its own
// colour and its own mark, and nothing animates.
//   live    -> green, a filled dot
//   waiting -> amber, a hollow ring
//   ended   -> dark, a check
const PILL =
  'inline-flex h-7 shrink-0 items-center gap-2 rounded-[0.6rem] px-2.5 text-xs font-medium whitespace-nowrap select-none';

const SOLID_EDGE = 'inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(0,0,0,0.1)';

const COLOURS: Record<PillStatus, string> = {
  live: `bg-gradient-to-b from-accent-500 to-accent-600 text-white shadow-[${SOLID_EDGE},0_0_0_1px_var(--color-accent-700),0_1px_2px_rgba(17,16,20,0.16)]`,
  waiting: `bg-gradient-to-b from-amber-300 to-amber-400 text-amber-950 shadow-[${SOLID_EDGE},0_0_0_1px_var(--color-amber-600),0_1px_2px_rgba(17,16,20,0.16)]`,
  ended: `bg-gradient-to-b from-[#2a2930] to-night text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(0,0,0,0.6),0_1px_2px_rgba(17,16,20,0.2)]`,
};

function Mark({ status }: { status: PillStatus }) {
  if (status === 'live') {
    return <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" />;
  }
  if (status === 'waiting') {
    return (
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--color-amber-900)]"
      />
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0">
      <path
        d="M2.5 6.4 5 8.8l4.5-5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface StatusPillProps {
  status: PillStatus;
  children: string;
  className?: string;
}

export function StatusPill({ status, children, className = '' }: StatusPillProps) {
  return (
    <span data-status={status} className={`${PILL} ${COLOURS[status]} ${className}`.trim()}>
      <Mark status={status} />
      {children}
    </span>
  );
}
