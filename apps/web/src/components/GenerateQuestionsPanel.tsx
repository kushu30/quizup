import {
  GENERATION_MAX_COUNT,
  GENERATION_PASSAGE_MAX_LENGTH,
  GENERATION_TOPIC_MAX_LENGTH,
  generateQuestionsRequestSchema,
  type Difficulty,
} from '@quizup/shared';
import { useState, type FormEvent } from 'react';
import { api, describeError } from '../lib/api';

interface GenerateQuestionsPanelProps {
  quizId: string;
  onGenerated: () => void;
}

export function GenerateQuestionsPanel({ quizId, onGenerated }: GenerateQuestionsPanelProps) {
  const [topic, setTopic] = useState('');
  const [passage, setPassage] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccessMessage(null);
    const parsed = generateQuestionsRequestSchema.safeParse({ topic, passage, count, difficulty });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    setErrorMessage(null);
    setGenerating(true);
    try {
      const created = await api.generateQuestions(quizId, parsed.data);
      setSuccessMessage(`${created.length} questions added to Needs review.`);
      onGenerated();
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 rounded-lg border border-violet-200 bg-violet-50 p-4"
    >
      <h3 className="font-medium">Generate with AI</h3>
      <p className="text-sm text-slate-600">
        Questions are saved as pending. Review, edit and approve them before they can be used in a
        live session.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-3">
          Topic
          <input
            maxLength={GENERATION_TOPIC_MAX_LENGTH}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          Number of questions
          <input
            type="number"
            min={1}
            max={GENERATION_MAX_COUNT}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          />
        </label>
        <label className="block text-sm">
          Difficulty
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as Difficulty)}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Passage (optional). Questions will be answerable from this text.
        <textarea
          rows={5}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          value={passage}
          onChange={(event) => setPassage(event.target.value)}
        />
        <span
          className={`block text-right text-xs ${
            passage.length > GENERATION_PASSAGE_MAX_LENGTH ? 'text-red-700' : 'text-slate-500'
          }`}
        >
          {passage.length} / {GENERATION_PASSAGE_MAX_LENGTH}
        </span>
      </label>
      {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
      {successMessage && <p className="text-sm text-emerald-800">{successMessage}</p>}
      <button
        type="submit"
        disabled={generating}
        className="rounded-md bg-violet-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {generating ? 'Generating... this can take up to a minute' : 'Generate questions'}
      </button>
    </form>
  );
}
