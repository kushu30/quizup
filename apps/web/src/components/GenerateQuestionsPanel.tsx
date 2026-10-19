import {
  GENERATION_MAX_COUNT,
  GENERATION_PASSAGE_MAX_LENGTH,
  GENERATION_TOPIC_MAX_LENGTH,
  generateQuestionsRequestSchema,
  type Difficulty,
} from '@quizup/shared';
import { useState, type FormEvent } from 'react';
import { api, describeError } from '../lib/api';
import { Button, Notice, SelectField, TextAreaField, TextField } from './ui';

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
      aria-labelledby="generate-questions-heading"
      className="space-y-4"
    >
      <div className="space-y-1">
        <h3 id="generate-questions-heading" className="text-base font-semibold">
          Generate with AI
        </h3>
        <p className="text-sm text-muted">
          Questions are saved as pending. Review, edit and approve them before they can be used in a
          live session.
        </p>
      </div>
      <TextField
        label="Topic"
        maxLength={GENERATION_TOPIC_MAX_LENGTH}
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Number of questions"
          type="number"
          min={1}
          max={GENERATION_MAX_COUNT}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />
        <SelectField
          label="Difficulty"
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as Difficulty)}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </SelectField>
      </div>
      <TextAreaField
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
      {errorMessage && <Notice tone="danger">{errorMessage}</Notice>}
      {successMessage && <Notice tone="success">{successMessage}</Notice>}
      <Button type="submit" variant="secondary" disabled={generating}>
        {generating ? 'Generating... this can take up to a minute' : 'Generate questions'}
      </Button>
    </form>
  );
}
