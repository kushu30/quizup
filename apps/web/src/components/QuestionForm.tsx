import { questionInputSchema, type QuestionInput } from '@quizup/shared';
import { useId, useState, type FormEvent } from 'react';
import { AuthField, AuthNotice, AuthSelect, AuthTextArea } from './landing/AuthField';
import { ctaDark, ctaLight, ctaSize } from './landing/cta';
import { QuestionImageField } from './QuestionImageField';

interface QuestionFormProps {
  initialValue?: QuestionInput;
  submitLabel: string;
  onSubmit: (input: QuestionInput) => Promise<void>;
  onCancel?: () => void;
  // Modules that already exist in this quiz, offered as suggestions.
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
          <AuthField
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
        <AuthSelect
          label="Difficulty"
          value={draft.difficulty}
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
          onChange={(next) =>
            setDraft({ ...draft, difficulty: next as QuestionInput['difficulty'] })
          }
        />
      </div>
      <AuthTextArea
        label="Question"
        rows={2}
        placeholder="What would you like to ask?"
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
      <fieldset>
        <legend className="text-sm font-medium text-night">Options</legend>
        <p className="mt-1 mb-3 text-sm text-night/50">
          Select the circle next to the correct answer.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.options.map((option, optionIndex) => {
            const correct = draft.correct_index === optionIndex;
            return (
              <div
                key={OPTION_LETTERS[optionIndex]}
                className={`flex items-center gap-3 rounded-xl px-3 transition-[background-color,box-shadow] duration-200 ease-soft focus-within:shadow-[0_0_0_2px_var(--color-accent-500)] ${
                  correct
                    ? 'bg-accent-50 shadow-[0_0_0_1px_var(--color-accent-300)]'
                    : 'bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.12)]'
                }`}
              >
                <input
                  type="radio"
                  name={radioName}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent-600)]"
                  aria-label={`Option ${OPTION_LETTERS[optionIndex]} is correct`}
                  checked={correct}
                  onChange={() => setDraft({ ...draft, correct_index: optionIndex })}
                />
                <span
                  aria-hidden="true"
                  className={`w-4 font-geist-mono text-xs font-medium ${
                    correct ? 'text-accent-700' : 'text-night/40'
                  }`}
                >
                  {OPTION_LETTERS[optionIndex]}
                </span>
                <input
                  aria-label={`Option ${OPTION_LETTERS[optionIndex]}`}
                  className="h-10 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-night placeholder:text-night/35 focus:outline-none"
                  placeholder={`Answer ${OPTION_LETTERS[optionIndex]}`}
                  value={option}
                  onChange={(event) => setOption(optionIndex, event.target.value)}
                />
                {correct && (
                  <span className="shrink-0 text-xs font-medium text-accent-700">Correct</span>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      {errors.length > 0 && (
        <AuthNotice tone="danger">
          {errors.length === 1 ? (
            errors[0]
          ) : (
            <ul className="list-disc space-y-0.5 pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </AuthNotice>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={submitting} className={`${ctaDark} ${ctaSize.md}`}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`${ctaLight} ${ctaSize.md}`}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
