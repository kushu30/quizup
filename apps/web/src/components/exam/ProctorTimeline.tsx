import {
  PROCTOR_COUNTED_TYPES,
  PROCTOR_TYPE_LABELS,
  emptyProctorCounts,
  type ProctorEventRecord,
  type ProctorRecordType,
} from '@quizup/shared';
import { memo, useMemo } from 'react';
import { Button } from '../ui';

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
  face_missing: '◌',
  multiple_faces: '⚇',
  looking_away: '↻',
  camera_blocked: '▬',
  loud_audio: '♪',
  camera_lost: '⊘',
  camera_denied: '⊘',
  mic_lost: '⊘',
  mic_denied: '⊘',
  auto_submitted: '■',
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
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-paper text-base"
      >
        {TYPE_ICONS[event.type]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {PROCTOR_TYPE_LABELS[event.type]}
          {detail && <span className="ml-2 font-normal text-muted">{detail}</span>}
          {event.late && (
            <span className="ml-2 rounded-sm bg-marker-soft px-1.5 py-0.5 text-xs font-medium text-marker-ink">
              late
            </span>
          )}
        </p>
        <p className="text-xs text-muted">
          <span>{formatElapsed(event.serverAt, startedAt)}</span>
          {', '}
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
      className="space-y-4 rounded-lg border border-rule bg-surface p-5"
      aria-label={`Proctor timeline for ${displayName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-xl font-semibold break-words">{displayName}</h3>
          <p className="text-sm text-muted">
            These signals are indicators, not proof of misconduct.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <ul className="flex flex-wrap gap-2 text-xs">
        {PROCTOR_COUNTED_TYPES.map((type) => (
          <li key={type} className="rounded-md border border-rule px-2 py-1 tabular-nums">
            {PROCTOR_TYPE_LABELS[type]}: {counts[type]}
          </li>
        ))}
        {droppedEvents > 0 && (
          <li className="rounded-md bg-marker-soft px-2 py-1 font-medium text-marker-ink">
            Dropped by rate limit: {droppedEvents}
          </li>
        )}
      </ul>
      {events.length === 0 ? (
        <p className="text-muted">No events yet.</p>
      ) : (
        <ol className="divide-y divide-rule border-t border-rule">
          {events.map((event) => (
            <TimelineItem key={event.id} event={event} startedAt={attemptStartedAtMs} />
          ))}
        </ol>
      )}
    </section>
  );
}
