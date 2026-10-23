import {
  EXAM_MAX_DURATION_MINUTES,
  EXAM_MIN_DURATION_MINUTES,
  type AssessmentType,
} from '@quizup/shared';
import { useId } from 'react';
import { AuthField } from './landing/AuthField';
import { ChoiceCard } from './landing/ChoiceCard';
import { QuizTypeIcon } from './quizMeta';
import { Tooltip } from './ui';

interface AssessmentTypePickerProps {
  value: AssessmentType;
  onChange: (type: AssessmentType) => void;
  durationMinutes: string;
  onDurationChange: (minutes: string) => void;
}

const ADAPTIVE_EXPLAINER =
  'Every student has a rating. Their rating goes up when they answer correctly and down when they miss. Each next question is picked close to that rating, so strong students get stretched and nobody gets lost. Points are scored the same way as a live quiz.';

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
  const name = useId();

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
                <Tooltip label={ADAPTIVE_EXPLAINER} side="top" align="end">
                  <span
                    tabIndex={0}
                    aria-label="How adaptive quizzes work"
                    className="flex h-6 w-6 cursor-help items-center justify-center rounded-full bg-night/[0.06] font-geist-mono text-xs font-medium text-night/55 transition-colors duration-200 ease-soft hover:bg-night/10 hover:text-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                  >
                    i
                  </span>
                </Tooltip>
              ) : undefined
            }
          />
        ))}
      </div>
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
