import { PROCTOR_FLAG_LIMIT } from '@quizup/shared';
import { useId } from 'react';
import { AppIcon } from '../app/icons';
import { ProctorOptionCard } from './ProctorOptionCard';

export interface ProctorOptionsValue {
  camera: boolean;
  mic: boolean;
  autoSubmit: boolean;
  /** Kept as text while typing; use flagLimitFrom() for the number. */
  limitText: string;
}

export const DEFAULT_PROCTOR_OPTIONS: ProctorOptionsValue = {
  camera: false,
  mic: false,
  autoSubmit: false,
  limitText: String(PROCTOR_FLAG_LIMIT.suggested),
};

export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return PROCTOR_FLAG_LIMIT.suggested;
  }
  return Math.min(PROCTOR_FLAG_LIMIT.max, Math.max(PROCTOR_FLAG_LIMIT.min, Math.round(value)));
}

/** Starting options from choices saved on the quiz (or the defaults when none were saved). */
export function optionsFromSettings(
  saved: { camera: boolean; mic: boolean; flagLimit: number | null } | undefined,
): ProctorOptionsValue {
  if (!saved) {
    return DEFAULT_PROCTOR_OPTIONS;
  }
  return {
    camera: saved.camera,
    mic: saved.mic,
    autoSubmit: saved.flagLimit !== null,
    limitText: String(saved.flagLimit ?? PROCTOR_FLAG_LIMIT.suggested),
  };
}

/** Only an exam with a camera or microphone on can auto-submit. */
export function canAutoSubmit(kind: 'live' | 'exam', value: ProctorOptionsValue): boolean {
  return kind === 'exam' && (value.camera || value.mic);
}

export function flagLimitFrom(
  kind: 'live' | 'exam',
  value: ProctorOptionsValue,
): number | undefined {
  return canAutoSubmit(kind, value) && value.autoSubmit
    ? clampLimit(Number(value.limitText))
    : undefined;
}

const CAMERA_ICON = (
  <AppIcon size={18}>
    <path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3z" />
    <circle cx="12" cy="13" r="3.5" />
  </AppIcon>
);

const MIC_ICON = (
  <AppIcon size={18}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </AppIcon>
);

const WARNING_ICON = (
  <AppIcon size={18}>
    <path d="M12 3 3 20h18L12 3zM12 10v4M12 17.5v.01" />
  </AppIcon>
);

interface ProctorOptionsProps {
  kind: 'live' | 'exam';
  value: ProctorOptionsValue;
  onChange: (value: ProctorOptionsValue) => void;
}

/** The camera, microphone and auto-submit choices, shared by the quiz editor and the Start dialog. */
export function ProctorOptions({ kind, value, onChange }: ProctorOptionsProps) {
  const limitId = useId();
  const limitHintId = useId();
  const showAutoSubmit = canAutoSubmit(kind, value);
  const set = (patch: Partial<ProctorOptionsValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2.5">
      <ProctorOptionCard
        title="Watch the camera"
        description="Notices no face in view, several faces, turning away or a blocked camera. Analysed on the student's device; nothing is recorded or sent."
        icon={CAMERA_ICON}
        checked={value.camera}
        onChange={(camera) => set({ camera })}
      />
      <ProctorOptionCard
        title="Listen to the microphone"
        description="Notices loud or continuous sound. Only loudness is measured on the student's device; nothing is recorded or sent."
        icon={MIC_ICON}
        checked={value.mic}
        onChange={(mic) => set({ mic })}
      />
      {showAutoSubmit && (
        <div className="space-y-2.5 rounded-[0.8rem] bg-night/[0.03] p-3.5 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.08)]">
          <ProctorOptionCard
            title="Submit the exam automatically after repeated flags"
            description="Only camera and microphone flags count. Answers given so far are graded as usual, and you can see which exams were submitted this way."
            icon={WARNING_ICON}
            checked={value.autoSubmit}
            onChange={(autoSubmit) => set({ autoSubmit })}
          />
          {value.autoSubmit && (
            <div className="flex flex-wrap items-center gap-3 pl-1">
              <label htmlFor={limitId} className="text-sm font-medium text-night">
                Flags before submitting
              </label>
              <input
                id={limitId}
                type="number"
                inputMode="numeric"
                min={PROCTOR_FLAG_LIMIT.min}
                max={PROCTOR_FLAG_LIMIT.max}
                value={value.limitText}
                aria-describedby={limitHintId}
                onChange={(event) => set({ limitText: event.target.value })}
                onBlur={() => set({ limitText: String(clampLimit(Number(value.limitText))) })}
                className="h-10 w-20 rounded-[0.8rem] bg-white px-3 text-center text-[0.9375rem] text-night shadow-[0_0_0_1px_rgba(17,16,20,0.12)] transition-shadow duration-200 ease-soft hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none"
              />
              <span id={limitHintId} className="text-sm text-night/55">
                Between {PROCTOR_FLAG_LIMIT.min} and {PROCTOR_FLAG_LIMIT.max}. Students see this
                limit before they start.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
