import { quizCreateSchema } from '@quizup/shared';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AuthField, AuthNotice } from './landing/AuthField';
import { ctaLight, ctaPrimary, ctaSize } from './landing/cta';

interface NewQuizDialogProps {
  onSubmit: (title: string) => Promise<string | null>;
  onCancel: () => void;
}

export function NewQuizDialog({ onSubmit, onCancel }: NewQuizDialogProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rootRef.current?.querySelector('input')?.focus();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = quizCreateSchema.safeParse({ title });
    if (!parsed.success) {
      setTitleError(parsed.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    setTitleError(null);
    setFailure(null);
    setBusy(true);
    const problem = await onSubmit(parsed.data.title);
    setBusy(false);
    if (problem) {
      setFailure(problem);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-night/50 p-4 backdrop-blur-[2px]">
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="animate-pop w-full max-w-md rounded-2xl bg-white p-6 font-geist text-night shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_24px_60px_-20px_rgba(17,16,20,0.45)]"
      >
        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
          <div className="space-y-1.5">
            <h2 id={titleId} className="text-[1.375rem] font-medium tracking-tight">
              Name your quiz
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-night/55">
              Students see this title. You can change it later in the quiz editor.
            </p>
          </div>
          <AuthField
            label="Quiz title"
            placeholder="For example, Fractions review"
            value={title}
            error={titleError}
            onChange={(event) => setTitle(event.target.value)}
          />
          {failure && <AuthNotice tone="danger">{failure}</AuthNotice>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className={`${ctaLight} ${ctaSize.md}`}
            >
              Cancel
            </button>
            <button type="submit" disabled={busy} className={`${ctaPrimary} ${ctaSize.md}`}>
              Create quiz
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
