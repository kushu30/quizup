import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useInShell } from './app/shellContext';
import { ctaDanger, ctaLight, ctaPrimary, ctaSize } from './landing/cta';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'brand';
  busy?: boolean;
  // The redesigned look. By default it follows the page: redesigned pages (inside the app shell)
  // get it, the others keep the original one.
  modern?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  modern: modernProp,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const inShell = useInShell();
  const modern = modernProp ?? inShell;
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={`animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 ${
        modern ? 'bg-night/50 backdrop-blur-[2px]' : 'bg-ink/60'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={handleKeyDown}
        className={`animate-pop w-full max-w-sm space-y-4 p-6 ${
          modern
            ? 'rounded-2xl bg-white font-geist text-night shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_24px_60px_-20px_rgba(17,16,20,0.45)]'
            : 'rounded-xl bg-surface shadow-xl'
        }`}
      >
        <h2
          id={titleId}
          className={
            modern ? 'text-[1.375rem] font-medium tracking-tight' : 'text-xl font-semibold'
          }
        >
          {title}
        </h2>
        <div id={bodyId} className={modern ? 'leading-relaxed text-night/60' : 'text-muted'}>
          {children}
        </div>
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={
              modern
                ? `${ctaLight} ${ctaSize.md}`
                : 'inline-flex min-h-11 items-center justify-center rounded-md border border-rule-strong bg-surface px-5 text-base font-semibold text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={
              modern
                ? `${tone === 'danger' ? ctaDanger : ctaPrimary} ${ctaSize.md}`
                : `inline-flex min-h-11 items-center justify-center rounded-md px-5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                    tone === 'danger'
                      ? 'bg-alert hover:bg-alert/90'
                      : 'bg-board hover:bg-board-strong'
                  }`
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
