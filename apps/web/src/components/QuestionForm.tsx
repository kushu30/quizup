import { questionInputSchema, type QuestionInput } from '@quizup/shared';
import { useState, type FormEvent } from 'react';

interface QuestionFormProps {
  initialValue?: QuestionInput;
  submitLabel: string;
  onSubmit: (input: QuestionInput) => Promise<void>;
  onCancel?: () => void;
}

const EMPTY_QUESTION: QuestionInput = {
  topic: '',
  stem: '',
  options: ['', '', '', ''],
  correct_index: 0,
  difficulty: 'medium',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function QuestionForm({ initialValue, submitLabel, onSubmit, onCancel }: QuestionFormProps) {
  const [draft, setDraft] = useState<QuestionInput>(initialValue ?? EMPTY_QUESTION);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
        setDraft(EMPTY_QUESTION);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Could not save the question']);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Topic
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={draft.topic}
            onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          Difficulty
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
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
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Question
        <textarea
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          value={draft.stem}
          onChange={(event) => setDraft({ ...draft, stem: event.target.value })}
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm">Options (select the correct one)</legend>
        {draft.options.map((option, optionIndex) => (
          <div key={OPTION_LETTERS[optionIndex]} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct-option"
              aria-label={`Option ${OPTION_LETTERS[optionIndex]} is correct`}
              checked={draft.correct_index === optionIndex}
              onChange={() => setDraft({ ...draft, correct_index: optionIndex })}
            />
            <span className="w-4 text-sm text-slate-500">{OPTION_LETTERS[optionIndex]}</span>
            <input
              className="flex-1 rounded-md border border-slate-300 px-3 py-2"
              value={option}
              onChange={(event) => setOption(optionIndex, event.target.value)}
            />
          </div>
        ))}
      </fieldset>
      {errors.map((error) => (
        <p key={error} className="text-sm text-red-700">
          {error}
        </p>
      ))}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
