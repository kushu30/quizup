import { questionInputSchema, type QuestionInput } from '@quizup/shared';
import { useId, useState, type FormEvent } from 'react';
import { QuestionImageField } from './QuestionImageField';
import { Button, Notice, SelectField, TextAreaField, TextField } from './ui';

interface QuestionFormProps {
  initialValue?: QuestionInput;
  submitLabel: string;
  onSubmit: (input: QuestionInput) => Promise<void>;
  onCancel?: () => void;
  modules?: string[];
}

const EMPTY_QUESTION: QuestionInput = {
  topic: '',
  stem: '',
  options: ['', '', '', ''],
  correct_index: 0,
  difficulty: 'medium',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function QuestionForm({
  initialValue,
  submitLabel,
  onSubmit,
  onCancel,
  modules = [],
}: QuestionFormProps) {
  const [draft, setDraft] = useState<QuestionInput>(initialValue ?? EMPTY_QUESTION);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const radioName = useId();
  const moduleListId = useId();

  function setOption(optionIndex: number, text: string) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, index) => (index === optionIndex ? text : option)),
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = questionInputSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => issue.message));
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
      if (!initialValue) {
        setDraft({ ...EMPTY_QUESTION, topic: draft.topic });
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Could not save the question']);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <TextField
            label="Module (optional)"
            list={moduleListId}
            placeholder="For example, Module 1"
            hint="Leave it empty to file the question under Unsorted. You can move questions later."
            value={draft.topic}
            onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
          />
          <datalist id={moduleListId}>
            {modules.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <SelectField
          label="Difficulty"
          value={draft.difficulty}
          onChange={(event) =>
            setDraft({
              ...draft,
              difficulty: event.target.value as QuestionInput['difficulty'],
            })
          }
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </SelectField>
      </div>
      <TextAreaField
        label="Question"
        rows={2}
        value={draft.stem}
        onChange={(event) => setDraft({ ...draft, stem: event.target.value })}
      />
      <QuestionImageField
        imageUrl={draft.image_url ?? null}
        imageAlt={draft.image_alt ?? null}
        onChange={({ imageUrl, imageAlt }) =>
          setDraft({ ...draft, image_url: imageUrl, image_alt: imageAlt })
        }
      />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Options</legend>
        <p className="-mt-1 mb-2 text-sm text-muted">
          Select the circle next to the correct answer.
        </p>
        {draft.options.map((option, optionIndex) => {
          const correct = draft.correct_index === optionIndex;
          return (
            <div
              key={OPTION_LETTERS[optionIndex]}
              className={`flex items-center gap-3 rounded-md border px-3 py-1.5 ${
                correct ? 'border-success/50 bg-success-soft' : 'border-rule bg-surface'
              }`}
            >
              <input
                type="radio"
                name={radioName}
                className="h-4 w-4 shrink-0 accent-success"
                aria-label={`Option ${OPTION_LETTERS[optionIndex]} is correct`}
                checked={correct}
                onChange={() => setDraft({ ...draft, correct_index: optionIndex })}
              />
              <span aria-hidden="true" className="w-4 text-sm font-semibold text-muted">
                {OPTION_LETTERS[optionIndex]}
              </span>
              <input
                aria-label={`Option ${OPTION_LETTERS[optionIndex]}`}
                className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1.5 text-base outline-offset-0 placeholder:text-muted/70"
                placeholder={`Answer ${OPTION_LETTERS[optionIndex]}`}
                value={option}
                onChange={(event) => setOption(optionIndex, event.target.value)}
              />
            </div>
          );
        })}
      </fieldset>
      {errors.length > 0 && (
        <Notice tone="danger">
          {errors.length === 1 ? (
            errors[0]
          ) : (
            <ul className="list-disc space-y-0.5 pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
