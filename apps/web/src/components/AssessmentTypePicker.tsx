import {
  EXAM_MAX_DURATION_MINUTES,
  EXAM_MIN_DURATION_MINUTES,
  type AssessmentType,
} from '@quizup/shared';
import { useId, useState } from 'react';
import { AuthField } from './landing/AuthField';
import { ChoiceCard } from './landing/ChoiceCard';
import { QuizTypeIcon } from './quizMeta';

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
      <p id={labelId} className="text-sm font-medium text-night">
        Assessment type
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2">
        {OPTIONS.map((option) => (
          <ChoiceCard
            key={option.type}
            name={name}
            value={option.type}
            checked={value === option.type}
            onChange={() => onChange(option.type)}
            title={option.title}
            summary={option.summary}
            icon={<QuizTypeIcon type={option.type} />}
            trailing={
              option.type === 'adaptive' ? (
                <button
                  type="button"
                  aria-label="How adaptive quizzes work"
                  aria-expanded={explainerOpen}
                  aria-controls={explainerId}
                  onClick={() => setExplainerOpen((open) => !open)}
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-geist-mono text-xs font-medium transition-colors duration-200 ease-soft ${
                    explainerOpen
                      ? 'bg-night text-white'
                      : 'bg-night/[0.06] text-night/55 hover:bg-night/10 hover:text-night'
                  }`}
                >
                  i
                </button>
              ) : undefined
            }
          />
        ))}
      </div>
      {explainerOpen && (
        <div
          id={explainerId}
          className="animate-fade-in rounded-xl bg-night/[0.03] p-4 text-sm leading-relaxed text-night/70 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.06)]"
        >
          <p className="font-medium text-night">How adaptive quizzes work</p>
          <p className="mt-1">
            Every student has a rating. Their rating goes up when they answer correctly and down
            when they miss. Each next question is picked close to that rating, so strong students
            get stretched and nobody gets lost. Points are scored the same way as a live quiz.
          </p>
        </div>
      )}
      {value === 'exam' && (
        <AuthField
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
