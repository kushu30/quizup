import {
  EXAM_MAX_DURATION_MINUTES,
  EXAM_MIN_DURATION_MINUTES,
  type AssessmentType,
} from '@quizup/shared';
import { useId, useState } from 'react';
import { TextField } from './ui';

interface AssessmentTypePickerProps {
  value: AssessmentType;
  onChange: (type: AssessmentType) => void;
  durationMinutes: string;
  onDurationChange: (minutes: string) => void;
}

const OPTIONS: { type: AssessmentType; title: string; summary: string }[] = [
  {
    type: 'live',
    title: 'Live quiz',
    summary: 'Everyone answers the same question at the same time, with a leaderboard.',
  },
  {
    type: 'adaptive',
    title: 'Adaptive quiz',
    summary: 'Live, but each student gets questions matched to their level.',
  },
  {
    type: 'exam',
    title: 'Timed exam',
    summary: 'Students work alone against a timer. Results stay hidden until you release them.',
  },
];

export function AssessmentTypePicker({
  value,
  onChange,
  durationMinutes,
  onDurationChange,
}: AssessmentTypePickerProps) {
  const labelId = useId();
  const explainerId = useId();
  const name = useId();
  const [explainerOpen, setExplainerOpen] = useState(false);

  return (
    <div className="space-y-3">
      <p id={labelId} className="text-sm font-medium">
        Assessment type
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2">
        {OPTIONS.map((option) => {
          const checked = value === option.type;
          return (
            <div key={option.type} className="relative">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-3 pr-11 ${
                  checked
                    ? 'border-board bg-board-soft'
                    : 'border-rule bg-surface hover:border-rule-strong'
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  value={option.type}
                  checked={checked}
                  onChange={() => onChange(option.type)}
                  className="mt-1 h-4 w-4 shrink-0 accent-board"
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{option.title}</span>
                  <span className="block text-sm text-muted">{option.summary}</span>
                </span>
              </label>
              {option.type === 'adaptive' && (
                <button
                  type="button"
                  aria-label="How adaptive quizzes work"
                  aria-expanded={explainerOpen}
                  aria-controls={explainerId}
                  onClick={() => setExplainerOpen((open) => !open)}
                  className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full border border-rule-strong bg-surface text-xs font-bold text-muted hover:text-ink"
                >
                  i
                </button>
              )}
            </div>
          );
        })}
      </div>
      {explainerOpen && (
        <div
          id={explainerId}
          className="rounded-md border border-marker/60 bg-marker-soft p-3 text-sm text-ink"
        >
          <p className="font-semibold">How adaptive quizzes work</p>
          <p className="mt-1">
            Every student has a rating. Their rating goes up when they answer correctly and down
            when they miss. Each next question is picked close to that rating, so strong students
            get stretched and nobody gets lost. Points are scored the same way as a live quiz.
          </p>
        </div>
      )}
      {value === 'exam' && (
        <TextField
          label="Exam length in minutes"
          type="number"
          min={EXAM_MIN_DURATION_MINUTES}
          max={EXAM_MAX_DURATION_MINUTES}
          value={durationMinutes}
          onChange={(event) => onDurationChange(event.target.value)}
        />
      )}
    </div>
  );
}
