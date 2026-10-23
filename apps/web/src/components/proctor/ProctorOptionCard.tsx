import { useId, type ReactNode } from 'react';

interface ProctorOptionCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A checkbox presented as a card, in the same soft style as the app's buttons. */
export function ProctorOptionCard({
  title,
  description,
  icon,
  checked,
  onChange,
}: ProctorOptionCardProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[0.8rem] p-3.5 transition-[background-color,box-shadow] duration-200 ease-soft focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-500 ${
        checked
          ? 'bg-accent-50 shadow-[0_0_0_1px_var(--color-accent-300)]'
          : 'bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.11)] hover:shadow-[0_0_0_1px_rgba(17,16,20,0.22)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] ${
          checked ? 'bg-accent-500 text-white' : 'bg-night/[0.05] text-night/60'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span id={titleId} className="block text-[0.9375rem] font-medium text-night">
          {title}
        </span>
        <span id={descriptionId} className="mt-0.5 block text-sm leading-snug text-night/60">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent-600)]"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
