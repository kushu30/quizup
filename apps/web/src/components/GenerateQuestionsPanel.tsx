import {
  GENERATION_MAX_COUNT,
  GENERATION_PASSAGE_MAX_LENGTH,
  GENERATION_TOPIC_MAX_LENGTH,
  generateQuestionsRequestSchema,
  type Difficulty,
} from '@quizup/shared';
import { useState, type FormEvent } from 'react';
import { api, describeError } from '../lib/api';
import { AuthField, AuthNotice, AuthSelect, AuthTextArea } from './landing/AuthField';
import { ctaDark, ctaSize } from './landing/cta';

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

  const passageTooLong = passage.length > GENERATION_PASSAGE_MAX_LENGTH;
  const passageCount = `${passage.length} / ${GENERATION_PASSAGE_MAX_LENGTH} characters`;

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      aria-label="Generate with AI"
      className="space-y-5"
    >
      <p className="text-[0.9375rem] leading-relaxed text-night/60">
        Questions are saved as pending. Review, edit and approve them before they can be used in a
        live session.
      </p>
      <AuthField
        label="Topic"
        maxLength={GENERATION_TOPIC_MAX_LENGTH}
        placeholder="For example, The water cycle"
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField
          label="Number of questions"
          type="number"
          min={1}
          max={GENERATION_MAX_COUNT}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />
        <AuthSelect
          label="Difficulty"
          value={difficulty}
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
          onChange={(next) => setDifficulty(next as Difficulty)}
        />
      </div>
      <AuthTextArea
        label="Passage (optional)"
        rows={5}
        hint={
          passageTooLong
            ? undefined
            : `Questions will be answerable from this text. ${passageCount}`
        }
        error={passageTooLong ? `${passageCount}. Shorten the passage.` : undefined}
        value={passage}
        onChange={(event) => setPassage(event.target.value)}
      />
      {errorMessage && <AuthNotice tone="danger">{errorMessage}</AuthNotice>}
      {successMessage && <AuthNotice tone="info">{successMessage}</AuthNotice>}
      <button type="submit" disabled={generating} className={`${ctaDark} ${ctaSize.md}`}>
        {generating ? 'Generating... this can take up to a minute' : 'Generate questions'}
      </button>
    </form>
  );
}
