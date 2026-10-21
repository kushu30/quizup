import type { AccessMode } from '@quizup/shared';
import { useId } from 'react';
import { ChoiceCard } from './landing/ChoiceCard';

interface AccessModePickerProps {
  value: AccessMode;
  onChange: (mode: AccessMode) => void;
}

const OPTIONS: { mode: AccessMode; title: string; summary: string }[] = [
  {
    mode: 'open',
    title: 'Anyone with the code',
    summary: 'Students enter the join code and pick a display name.',
  },
  {
    mode: 'token',
    title: 'Invited students only',
    summary:
      'You add a list of students. Each gets a personal access token, so nobody can join under someone else’s name.',
  },
];

export function AccessModePicker({ value, onChange }: AccessModePickerProps) {
  const labelId = useId();
  const name = useId();

  return (
    <div className="space-y-3">
      <p id={labelId} className="text-sm font-medium text-night">
        Who can join
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2">
        {OPTIONS.map((option) => (
          <ChoiceCard
            key={option.mode}
            name={name}
            value={option.mode}
            checked={value === option.mode}
            onChange={() => onChange(option.mode)}
            title={option.title}
            summary={option.summary}
          />
        ))}
      </div>
    </div>
  );
}
