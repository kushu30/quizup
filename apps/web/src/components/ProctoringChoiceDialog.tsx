import { useEffect, useId, useRef } from 'react';
import { useModernLook } from './app/shellContext';
import { ctaLight, ctaSize } from './landing/cta';
import { Button } from './ui';

interface ProctoringChoiceDialogProps {
  kind: 'live' | 'exam';
  busy: boolean;
  onChoose: (proctored: boolean) => void;
  onCancel: () => void;
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
            It records no webcam, no microphone, no screen and no keystrokes. Students are told
            before they begin. The signals are hints, not proof of misconduct.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse sm:gap-3">
          <Button variant="brand" disabled={busy} onClick={() => onChoose(true)}>
            Start with proctoring
          </Button>
          <button
            ref={withoutRef}
            type="button"
            disabled={busy}
            onClick={() => onChoose(false)}
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
