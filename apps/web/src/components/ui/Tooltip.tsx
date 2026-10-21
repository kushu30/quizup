import { cloneElement, useId, type ReactElement } from 'react';

// A short label that appears over its child on hover or keyboard focus. It is out of the layout
// until then, so a label near the screen edge never widens the page. It describes the child
// (aria-describedby) rather than naming it, so icon buttons still need their own aria-label.
export function Tooltip({
  label,
  side = 'top',
  align = 'center',
  className = 'inline-flex',
  children,
}: {
  label: string;
  side?: 'top' | 'bottom';
  // Which edge of the child the label lines up with, so one near the screen edge stays on screen.
  align?: 'center' | 'start' | 'end';
  // Classes for the wrapper, for a child that must fill a flex or grid cell.
  className?: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const id = useId();
  return (
    <span className={`group/tip relative ${className}`}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute z-40 hidden w-max max-w-[min(16rem,calc(100vw-2rem))] animate-fade-in rounded-lg bg-night px-2.5 py-1.5 text-xs leading-snug font-normal whitespace-normal text-white shadow-[0_8px_24px_-8px_rgba(17,16,20,0.5)] group-focus-within/tip:block group-hover/tip:block ${
          align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'end' ? 'right-0' : 'left-0'
        } ${side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
      >
        {label}
      </span>
    </span>
  );
}
