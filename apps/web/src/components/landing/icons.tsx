import type { CSSProperties, ReactNode } from 'react';

// Custom icons for the redesigned pages. Each one is drawn on a 24px grid with a 1.5px stroke
// and carries a small filled tile in its accent colour, after the tail of the logo.
// When the surrounding `group` is hovered they ease into a second pose and ease back out:
// transitions only, never keyframes, so nothing restarts or snaps mid-hover.

const FILL_BOX = '[transform-box:fill-box]';
const EASE = 'transition-transform duration-500 ease-soft';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ACCENT = 'fill-[var(--icon-accent)] stroke-none';

// A question sheet whose answer tile slides into place.
export function IconQuestions() {
  return (
    <Svg>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 8h8M8 12h5" />
      <rect
        x="13"
        y="14.5"
        width="4"
        height="4"
        rx="1.2"
        className={`${ACCENT} ${FILL_BOX} ${EASE} origin-center group-hover:-translate-x-1 group-hover:scale-110`}
      />
    </Svg>
  );
}

// The four tiles of a code, spreading apart.
export function IconShare() {
  const tile = `${FILL_BOX} ${EASE} origin-center`;
  return (
    <Svg>
      <rect
        x="4"
        y="4"
        width="7"
        height="7"
        rx="2"
        className={`${tile} group-hover:-translate-x-0.5 group-hover:-translate-y-0.5`}
      />
      <rect
        x="13"
        y="4"
        width="7"
        height="7"
        rx="2"
        className={`${tile} group-hover:translate-x-0.5 group-hover:-translate-y-0.5`}
      />
      <rect
        x="4"
        y="13"
        width="7"
        height="7"
        rx="2"
        className={`${tile} group-hover:-translate-x-0.5 group-hover:translate-y-0.5`}
      />
      <rect
        x="13"
        y="13"
        width="7"
        height="7"
        rx="2"
        className={`${tile} ${ACCENT} group-hover:translate-x-0.5 group-hover:translate-y-0.5`}
      />
    </Svg>
  );
}

// Results bars that rearrange, like answers coming in.
export function IconResults() {
  const bar = `${FILL_BOX} ${EASE} origin-bottom`;
  return (
    <Svg>
      <path d="M4 20h16" />
      <rect
        x="6"
        y="12"
        width="3"
        height="5.5"
        rx="1"
        className={`${bar} group-hover:scale-y-150`}
      />
      <rect
        x="10.5"
        y="8.5"
        width="3"
        height="9"
        rx="1"
        className={`${bar} group-hover:scale-y-75`}
      />
      <rect
        x="15"
        y="5"
        width="3"
        height="12.5"
        rx="1"
        className={`${bar} ${ACCENT} group-hover:scale-y-90`}
      />
    </Svg>
  );
}

// A personal ticket that tilts as if handed over.
export function IconToken() {
  return (
    <Svg>
      <g className={`${FILL_BOX} ${EASE} origin-center group-hover:-rotate-12`}>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5V9a3 3 0 0 0 0 6v1.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5V15a3 3 0 0 0 0-6Z" />
        <path d="M15 8v8" strokeDasharray="1.5 2" />
        <rect x="7.5" y="10" width="4" height="4" rx="1.2" className={ACCENT} />
      </g>
    </Svg>
  );
}

// An eye with a square pupil that glances to the side.
export function IconProctor() {
  return (
    <Svg>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <rect
        x="10"
        y="10"
        width="4"
        height="4"
        rx="1.2"
        className={`${ACCENT} ${EASE} group-hover:translate-x-[2.5px]`}
      />
    </Svg>
  );
}

// Circular arrows that turn half way round the student's place.
export function IconReconnect() {
  return (
    <Svg>
      <g
        className={`${FILL_BOX} origin-center transition-transform duration-700 ease-soft group-hover:rotate-180`}
      >
        <path d="M19 12a7 7 0 0 1-12.2 4.7M5 12a7 7 0 0 1 12.2-4.7" />
        <path d="M17.5 3.5v4h-4M6.5 20.5v-4h4" />
      </g>
      <rect x="10" y="10" width="4" height="4" rx="1.2" className={ACCENT} />
    </Svg>
  );
}

// A screen whose logo tile grows, as if the brand were being applied.
export function IconBrand() {
  return (
    <Svg>
      <rect x="3" y="4" width="18" height="12.5" rx="2.5" />
      <path d="M12 16.5V20M8.5 20h7" />
      <rect
        x="6.5"
        y="7.5"
        width="4.5"
        height="4.5"
        rx="1.3"
        className={`${ACCENT} ${FILL_BOX} ${EASE} origin-center group-hover:scale-125`}
      />
      <path d="M13.5 8.5h4M13.5 11h2.5" />
    </Svg>
  );
}

// A speech bubble whose rating tiles fill one after another.
export function IconFeedback() {
  const tile =
    'fill-transparent transition-[fill] duration-300 ease-soft group-hover:fill-[var(--icon-accent)]';
  return (
    <Svg>
      <path d="M5.5 4.5h13A2.5 2.5 0 0 1 21 7v7.5a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 3.5V17h-2A2.5 2.5 0 0 1 3 14.5V7a2.5 2.5 0 0 1 2.5-2.5Z" />
      {[7, 10.75, 14.5].map((x, index) => (
        <rect
          key={x}
          x={x}
          y="9.25"
          width="2.5"
          height="2.5"
          rx="0.75"
          strokeWidth="1.2"
          className={tile}
          style={{ transitionDelay: `${index * 80}ms` }}
        />
      ))}
    </Svg>
  );
}

// A record sheet with an export arrow that drops down.
export function IconHistory() {
  return (
    <Svg>
      <path d="M7 3.5h7l4.5 4.5v10A2.5 2.5 0 0 1 16 20.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4.5" />
      <g className={`${EASE} group-hover:translate-y-[2px]`}>
        <path d="M11.5 10v5.5M9 13.5l2.5 2.5 2.5-2.5" />
      </g>
      <rect x="15.5" y="15.5" width="4" height="4" rx="1.2" className={ACCENT} />
    </Svg>
  );
}

// Rising steps with a tile that climbs, for a quiz that adapts to each student.
export function IconAdaptive() {
  return (
    <Svg>
      <path d="M3.5 19.5h4.5v-5h4.5v-5h4.5" />
      <rect
        x="16"
        y="4"
        width="5"
        height="5"
        rx="1.5"
        className={`${ACCENT} ${FILL_BOX} ${EASE} origin-center group-hover:-translate-y-0.5 group-hover:translate-x-px`}
      />
    </Svg>
  );
}

// A timer whose hand sweeps round, for a timed exam.
export function IconTimer() {
  return (
    <Svg>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M9.5 3h5" />
      <g
        className="transition-transform duration-700 ease-soft group-hover:rotate-90"
        style={{ transformBox: 'view-box', transformOrigin: '12px 13.5px' }}
      >
        <path d="M12 13.5V9.5" />
      </g>
      <rect x="10.25" y="11.75" width="3.5" height="3.5" rx="1.1" className={ACCENT} />
    </Svg>
  );
}

// A plain icon in one muted colour, with no tile and no hover motion, after Shotbase. Its small
// filled square takes the accent colour, or the icon's own colour when there is none.
export function PlainIcon({
  children,
  accent,
  className = '',
}: {
  children: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ '--icon-accent': accent ?? 'currentColor' } as CSSProperties}
      className={`inline-flex shrink-0 [&_svg]:h-[22px] [&_svg]:w-[22px] ${className}`}
    >
      {children}
    </span>
  );
}
