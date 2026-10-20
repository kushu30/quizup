import type { AccessMode } from '@quizup/shared';
import { useId } from 'react';

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
      <p id={labelId} className="text-sm font-medium">
        Who can join
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2">
        {OPTIONS.map((option) => {
          const checked = value === option.mode;
          return (
            <label
              key={option.mode}
              className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-3 ${
                checked
                  ? 'border-board bg-board-soft'
                  : 'border-rule bg-surface hover:border-rule-strong'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.mode}
                checked={checked}
                onChange={() => onChange(option.mode)}
                className="mt-1 h-4 w-4 shrink-0 accent-board"
              />
              <span className="min-w-0">
                <span className="block font-semibold">{option.title}</span>
                <span className="block text-sm text-muted">{option.summary}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
