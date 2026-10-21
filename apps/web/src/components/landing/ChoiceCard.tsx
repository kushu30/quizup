import type { ReactNode } from 'react';
import { useInShell } from '../app/shellContext';

// One option in a radio group, drawn as a card. The chosen card takes a green outline and tint.
export function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  title,
  summary,
  icon,
  trailing,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  summary: string;
  icon?: ReactNode;
  // Something to sit in the card's top right corner, outside the label, such as an info button.
  trailing?: ReactNode;
}) {
  const dense = useInShell();
  return (
    <div className="relative">
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl transition-[background-color,box-shadow] duration-200 ease-soft has-[:focus-visible]:shadow-[0_0_0_2px_var(--color-accent-500)] ${
          dense ? 'p-3' : 'p-3.5'
        } ${trailing ? 'pr-12' : ''} ${
          checked
            ? 'bg-accent-50 shadow-[0_0_0_1.5px_var(--color-accent-500)]'
            : 'bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.12)] hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)]'
        }`}
      >
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent-600)]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[0.9375rem] font-medium text-night">
            {icon}
            {title}
          </span>
          <span
            className={`block text-night/55 ${
              dense ? 'mt-0.5 text-[0.8125rem] leading-snug' : 'mt-1 text-sm leading-relaxed'
            }`}
          >
            {summary}
          </span>
        </span>
      </label>
      {trailing && <div className="absolute top-3 right-3">{trailing}</div>}
    </div>
  );
}
