import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { useInShell } from '../app/shellContext';
import { Dropdown, type DropdownOption } from '../ui/Dropdown';

// Form pieces for the sign-in page, in the landing page's style: roomy rounded controls whose
// outline turns to the accent colour on focus.

const CONTROL =
  'block w-full rounded-xl bg-white px-4 text-night shadow-[0_0_0_1px_rgba(17,16,20,0.14)] transition-shadow duration-200 ease-soft placeholder:text-night/40 hover:shadow-[0_0_0_1px_rgba(17,16,20,0.28)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none read-only:bg-canvas read-only:text-night/70 read-only:hover:shadow-[0_0_0_1px_rgba(17,16,20,0.14)] aria-[invalid=true]:shadow-[0_0_0_2px_var(--color-alert)]';

// Inside the app the same fields are tighter, so a form shows more without scrolling.
const DENSE_TEXT = 'h-10 rounded-[0.8rem] px-3.5 text-[0.9375rem]';

const CONTROL_SIZES = {
  text: 'h-12 text-base',
  // Join codes and access tokens: large, spaced-out monospace characters.
  code: 'h-14 text-center font-geist-mono text-2xl font-medium tracking-[0.3em] uppercase tabular-nums placeholder:tracking-normal',
};

type AuthFieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  look?: keyof typeof CONTROL_SIZES;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>;

export function AuthField({ label, hint, error, look = 'text', ...rest }: AuthFieldProps) {
  const dense = useInShell() && look === 'text';
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={dense ? 'space-y-1.5' : 'space-y-2'}>
      <label htmlFor={id} className="block text-sm font-medium text-night">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${CONTROL} ${dense ? DENSE_TEXT : CONTROL_SIZES[look]}`}
      />
      <FieldNotes hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  );
}

function FieldNotes({
  hintId,
  errorId,
  hint,
  error,
}: {
  hintId: string;
  errorId: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  return (
    <>
      {hint && (
        <p id={hintId} className="text-[0.8125rem] leading-snug text-night/50">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[0.8125rem] font-medium text-alert">
          {error}
        </p>
      )}
    </>
  );
}

type AuthTextAreaProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id'>;

export function AuthTextArea({ label, hint, error, ...rest }: AuthTextAreaProps) {
  const dense = useInShell();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={dense ? 'space-y-1.5' : 'space-y-2'}>
      <label htmlFor={id} className="block text-sm font-medium text-night">
        {label}
      </label>
      <textarea
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${CONTROL} ${
          dense
            ? 'rounded-[0.8rem] px-3.5 py-2 text-[0.9375rem] leading-normal'
            : 'py-3 text-base leading-relaxed'
        }`}
      />
      <FieldNotes hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  );
}

// A labelled choice from a short list, using the shared dropdown in its redesigned look.
export function AuthSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}) {
  const dense = useInShell();
  const id = useId();
  return (
    <div className={dense ? 'space-y-1.5' : 'space-y-2'}>
      <label htmlFor={id} className="block text-sm font-medium text-night">
        {label}
      </label>
      <Dropdown
        id={id}
        look="modern"
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        size={dense ? 'md' : 'lg'}
      />
    </div>
  );
}

// Inside the app, plain confirmations stay neutral so green keeps its meaning.
const APP_INFO_TONE = 'bg-night/[0.04] text-night/80 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.08)]';

const NOTICE_TONES = {
  info: 'bg-accent-50 text-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent-200)]',
  warning: 'bg-amber-50 text-amber-900 shadow-[inset_0_0_0_1px_var(--color-amber-200)]',
  danger: 'bg-alert-soft text-alert shadow-[inset_0_0_0_1px_rgba(180,35,24,0.18)]',
};

export function AuthNotice({
  tone,
  children,
  className = '',
  onDismiss,
  fading = false,
}: {
  tone: keyof typeof NOTICE_TONES;
  children: ReactNode;
  className?: string;
  // Shows a close button. Pair it with useAutoDismiss to clear the notice by itself too.
  onDismiss?: () => void;
  fading?: boolean;
}) {
  const inApp = useInShell();
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex animate-fade-in items-start gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed transition-opacity duration-300 ease-soft ${
        fading ? 'opacity-0' : 'opacity-100'
      } ${inApp && tone === 'info' ? APP_INFO_TONE : NOTICE_TONES[tone]} ${className}`.trim()}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-my-1 -mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-60 transition-[opacity,background-color] duration-200 ease-soft hover:bg-black/5 hover:opacity-100"
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="m3 3 6 6m0-6-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
