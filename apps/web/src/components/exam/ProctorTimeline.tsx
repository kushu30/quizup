import {
  PROCTOR_COUNTED_TYPES,
  PROCTOR_TYPE_LABELS,
  emptyProctorCounts,
  type ProctorEventRecord,
  type ProctorRecordType,
} from '@quizup/shared';
import { memo, useMemo } from 'react';

interface ProctorTimelineProps {
  displayName: string;
  attemptStartedAtMs: number | null;
  events: ProctorEventRecord[];
  droppedEvents: number;
  onClose: () => void;
}

const TYPE_ICONS: Record<ProctorRecordType, string> = {
  tab_switch: '⇄',
  window_blur: '◐',
  fullscreen_exit: '⤢',
  copy: '⧉',
  paste: '⎘',
  right_click: '☰',
  resize: '↔',
  focus_return: '↩',
  consent_given: '✓',
};

function formatElapsed(serverAt: number, startedAt: number | null): string {
  if (startedAt === null) {
    return '--:--';
  }
  const totalSeconds = Math.max(Math.round((serverAt - startedAt) / 1000), 0);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function describeDetail(event: ProctorEventRecord): string {
  const detail = event.detail;
  if (!detail) {
    return '';
  }
  switch (event.type) {
    case 'focus_return':
      return `away ${(Number(detail['durationMs']) / 1000).toFixed(1)} s`;
    case 'copy':
      return `${String(detail['length'])} characters${detail['cut'] ? ' (cut)' : ''}`;
    case 'paste':
      return `${String(detail['length'])} characters`;
    case 'resize':
      return `${String(detail['width'])} x ${String(detail['height'])}`;
    default:
      return '';
  }
}

const TimelineItem = memo(function TimelineItem({
  event,
  startedAt,
}: {
  event: ProctorEventRecord;
  startedAt: number | null;
}) {
  const detail = describeDetail(event);
  return (
    <li className="flex items-start gap-3 py-2 text-sm">
      <span
        aria-label={PROCTOR_TYPE_LABELS[event.type]}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base dark:bg-slate-800"
      >
        {TYPE_ICONS[event.type]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {PROCTOR_TYPE_LABELS[event.type]}
          {detail && <span className="ml-2 font-normal text-slate-600">{detail}</span>}
          {event.late && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
              late
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          <span className="tabular-nums">{formatElapsed(event.serverAt, startedAt)}</span>
          {' · '}
          {new Date(event.serverAt).toLocaleTimeString()}
        </p>
      </div>
    </li>
  );
});

export function ProctorTimeline({
  displayName,
  attemptStartedAtMs,
  events,
  droppedEvents,
  onClose,
}: ProctorTimelineProps) {
  const counts = useMemo(() => {
    const totals = emptyProctorCounts();
    for (const event of events) {
      if ((PROCTOR_COUNTED_TYPES as readonly string[]).includes(event.type)) {
        totals[event.type as keyof typeof totals] += 1;
      }
    }
    return totals;
  }, [events]);

  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 p-4"
      aria-label={`Proctor timeline for ${displayName}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{displayName}</h3>
        <button type="button" onClick={onClose} className="text-sm underline">
          Close
        </button>
      </div>
      <p className="text-xs text-slate-500">
        These signals are indicators, not proof of misconduct.
      </p>
      <ul className="flex flex-wrap gap-2 text-xs">
        {PROCTOR_COUNTED_TYPES.map((type) => (
          <li key={type} className="rounded-full border border-slate-300 px-2 py-1 tabular-nums">
            {PROCTOR_TYPE_LABELS[type]}: {counts[type]}
          </li>
        ))}
        {droppedEvents > 0 && (
          <li className="rounded-full border border-amber-300 px-2 py-1 text-amber-900">
            Dropped by rate limit: {droppedEvents}
          </li>
        )}
      </ul>
      {events.length === 0 ? (
        <p className="text-slate-500">No events yet.</p>
      ) : (
        <ol className="divide-y divide-slate-200">
          {events.map((event) => (
            <TimelineItem key={event.id} event={event} startedAt={attemptStartedAtMs} />
          ))}
        </ol>
      )}
    </section>
  );
}
