import { PROCTOR_FLAG_LIMIT } from '@quizup/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { AppIcon } from './app/icons';
import { useModernLook } from './app/shellContext';
import { ctaLight, ctaSize } from './landing/cta';
import { ProctorOptionCard } from './proctor/ProctorOptionCard';
import { Button } from './ui';

export interface ProctoringChoice {
  proctored: boolean;
  proctorCamera: boolean;
  proctorMic: boolean;
  /** Exams only: submit the exam automatically after this many camera or microphone flags. */
  proctorFlagLimit?: number;
}

interface ProctoringChoiceDialogProps {
  kind: 'live' | 'exam';
  busy: boolean;
  onChoose: (choice: ProctoringChoice) => void;
  onCancel: () => void;
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

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return PROCTOR_FLAG_LIMIT.suggested;
  }
  return Math.min(PROCTOR_FLAG_LIMIT.max, Math.max(PROCTOR_FLAG_LIMIT.min, Math.round(value)));
}

export function ProctoringChoiceDialog({
  kind,
  busy,
  onChoose,
  onCancel,
}: ProctoringChoiceDialogProps) {
  const modern = useModernLook();
  const titleId = useId();
  const bodyId = useId();
  const withoutRef = useRef<HTMLButtonElement>(null);
  const [camera, setCamera] = useState(false);
  const [mic, setMic] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [limitText, setLimitText] = useState(String(PROCTOR_FLAG_LIMIT.suggested));
  const limitId = useId();
  const limitHintId = useId();
  const showAutoSubmit = kind === 'exam' && (camera || mic);

  function choose(proctored: boolean) {
    if (!proctored) {
      return { proctored: false, proctorCamera: false, proctorMic: false };
    }
    return {
      proctored: true,
      proctorCamera: camera,
      proctorMic: mic,
      ...(showAutoSubmit && autoSubmit ? { proctorFlagLimit: clampLimit(Number(limitText)) } : {}),
    };
  }

  useEffect(() => {
    withoutRef.current?.focus();
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        modern
          ? 'animate-fade-in bg-night/50 font-geist text-night backdrop-blur-[2px]'
          : 'bg-ink/60'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
        }}
        className={`w-full max-w-lg space-y-4 p-6 ${
          modern
            ? 'animate-pop rounded-2xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_24px_60px_-20px_rgba(17,16,20,0.45)]'
            : 'rounded-lg bg-surface'
        }`}
      >
        <h2
          id={titleId}
          className={
            modern ? 'text-[1.375rem] font-medium tracking-tight' : 'text-xl font-semibold'
          }
        >
          Proctor this session?
        </h2>
        <div
          id={bodyId}
          className={`space-y-3 ${modern ? 'leading-relaxed text-night/60' : 'text-muted'}`}
        >
          <p>
            Proctoring records tab switches, the window losing focus, copy and paste, right-clicks
            and window resizes, and shows them to you next to each student.
            {kind === 'exam' ? ' Exams also ask students to stay in full screen.' : ''}
          </p>
          <p>
            Camera and microphone are off unless you turn them on below. It never records the screen
            or keystrokes. Students are told before they begin. The signals are hints, not proof of
            misconduct.
          </p>
        </div>
        <div className="space-y-2.5">
          <ProctorOptionCard
            title="Watch the camera"
            description="Notices no face in view, several faces, turning away or a blocked camera. Analysed on the student's device; nothing is recorded or sent."
            icon={CAMERA_ICON}
            checked={camera}
            onChange={setCamera}
          />
          <ProctorOptionCard
            title="Listen to the microphone"
            description="Notices loud or continuous sound. Only loudness is measured on the student's device; nothing is recorded or sent."
            icon={MIC_ICON}
            checked={mic}
            onChange={setMic}
          />
          {showAutoSubmit && (
            <div className="space-y-2.5 rounded-[0.8rem] bg-night/[0.03] p-3.5 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.08)]">
              <ProctorOptionCard
                title="Submit the exam automatically after repeated flags"
                description="Only camera and microphone flags count. Answers given so far are graded as usual, and you can see which exams were submitted this way."
                icon={
                  <AppIcon size={18}>
                    <path d="M12 3 3 20h18L12 3zM12 10v4M12 17.5v.01" />
                  </AppIcon>
                }
                checked={autoSubmit}
                onChange={setAutoSubmit}
              />
              {autoSubmit && (
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
                    value={limitText}
                    aria-describedby={limitHintId}
                    onChange={(event) => setLimitText(event.target.value)}
                    onBlur={() => setLimitText(String(clampLimit(Number(limitText))))}
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
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse sm:gap-3">
          <Button variant="brand" disabled={busy} onClick={() => onChoose(choose(true))}>
            Start with proctoring
          </Button>
          <button
            ref={withoutRef}
            type="button"
            disabled={busy}
            onClick={() => onChoose(choose(false))}
            className={
              modern
                ? `${ctaLight} ${ctaSize.md}`
                : 'inline-flex min-h-11 items-center justify-center rounded-md border border-rule-strong whitespace-nowrap bg-surface px-5 text-base font-semibold text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            Start without proctoring
          </button>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
