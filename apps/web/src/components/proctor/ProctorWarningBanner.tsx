import type { ProctorSeriousType } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { WARNING_VISIBLE_MS } from '../../lib/proctorMedia/thresholds';
import { AppIcon } from '../app/icons';

export interface ProctorWarning {
  id: number;
  type: ProctorSeriousType;
  count: number;
  limit: number | null;
}

const TEXT: Record<ProctorSeriousType, string> = {
  face_missing: "We can't see your face. Please stay in view.",
  multiple_faces: 'We can see more than one face. Only you should be in view.',
  looking_away: 'Please keep your eyes on the screen.',
  camera_blocked: 'Your camera looks blocked. Please uncover it.',
  loud_audio: 'We hear loud sound. Please keep the room quiet.',
};

/**
 * A short, non-blocking message that appears in the page flow (never over the question) when a
 * flag is raised. The last flag before the host's limit is an alert.
 */
export function ProctorWarningBanner({ warning }: { warning: ProctorWarning | null }) {
  const [visibleId, setVisibleId] = useState<number | null>(warning?.id ?? null);

  useEffect(() => {
    if (!warning) {
      setVisibleId(null);
      return;
    }
    setVisibleId(warning.id);
    const timer = setTimeout(() => setVisibleId(null), WARNING_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [warning]);

  if (!warning || visibleId !== warning.id) {
    return null;
  }
  const final = warning.limit !== null && warning.count === warning.limit - 1;
  const counter =
    warning.limit === null ? `Flag ${warning.count}` : `Flag ${warning.count} of ${warning.limit}`;

  return (
    <div
      role={final ? 'alert' : 'status'}
      aria-live={final ? 'assertive' : 'polite'}
      className={`animate-pop flex items-start gap-3 rounded-[0.8rem] p-3.5 ${
        final
          ? 'bg-alert-soft text-alert shadow-[inset_0_0_0_1px_rgba(180,35,24,0.25)]'
          : 'bg-amber-50 text-amber-900 shadow-[inset_0_0_0_1px_var(--color-amber-200)]'
      }`}
    >
      <AppIcon size={20} className="mt-0.5">
        <path d="M12 3 3 20h18L12 3zM12 10v4M12 17.5v.01" />
      </AppIcon>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{TEXT[warning.type]}</p>
        {final && <p className="mt-0.5 text-sm">One more and your exam will be submitted.</p>}
      </div>
      <span className="shrink-0 rounded-[0.6rem] bg-white/80 px-2 py-0.5 text-xs font-semibold tabular-nums">
        {counter}
      </span>
    </div>
  );
}
