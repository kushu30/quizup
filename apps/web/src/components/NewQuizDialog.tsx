import { quizCreateSchema } from '@quizup/shared';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Notice, TextField } from './ui';

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
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="animate-pop w-full max-w-md rounded-xl bg-surface p-6 shadow-xl"
      >
        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
          <div className="space-y-1">
            <h2 id={titleId} className="text-xl font-semibold">
              Name your quiz
            </h2>
            <p className="text-sm text-muted">
              Students see this title. You can change it later in the quiz editor.
            </p>
          </div>
          <TextField
            label="Quiz title"
            placeholder="For example, Fractions review"
            value={title}
            error={titleError}
            onChange={(event) => setTitle(event.target.value)}
          />
          {failure && <Notice tone="danger">{failure}</Notice>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={busy}>
              Create quiz
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
