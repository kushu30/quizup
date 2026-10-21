import {
  Children,
  isValidElement,
  useId,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { useModernLook } from '../app/shellContext';
import { Dropdown, type DropdownOption } from './Dropdown';

const CONTROL =
  'block w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-muted/70 focus:border-board disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-alert';

const MODERN_CONTROL =
  'block w-full rounded-[0.8rem] bg-white px-3.5 py-2 text-[0.9375rem] text-night shadow-[0_0_0_1px_rgba(17,16,20,0.14)] transition-shadow duration-200 ease-soft placeholder:text-night/40 hover:shadow-[0_0_0_1px_rgba(17,16,20,0.28)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none disabled:bg-canvas disabled:text-night/50 aria-[invalid=true]:shadow-[0_0_0_2px_var(--color-alert)]';

export function inputClasses(): string {
  return CONTROL;
}

interface FieldChrome {
  label: string;
  error?: string | null;
  hint?: string;
  className?: string;
}

interface ControlAttributes {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

function Field({
  label,
  error,
  hint,
  className = '',
  renderControl,
}: FieldChrome & { renderControl: (attributes: ControlAttributes) => ReactNode }) {
  const modern = useModernLook();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={`space-y-1.5 ${className}`.trim()}>
      <label
        htmlFor={id}
        className={`block text-sm font-medium ${modern ? 'text-night' : 'text-ink'}`}
      >
        {label}
      </label>
      {renderControl({
        id,
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint && (
        <p
          id={hintId}
          className={modern ? 'text-[0.8125rem] leading-snug text-night/50' : 'text-sm text-muted'}
        >
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = FieldChrome &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> & { inputClassName?: string };

export function TextField({
  label,
  error,
  hint,
  className,
  inputClassName = '',
  ...rest
}: TextFieldProps) {
  const modern = useModernLook();
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      className={className}
      renderControl={(attributes) => (
        <input
          {...rest}
          {...attributes}
          className={`${modern ? MODERN_CONTROL : CONTROL} ${inputClassName}`.trim()}
        />
      )}
    />
  );
}

type SelectFieldProps = FieldChrome &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id'> & { inputClassName?: string };

function optionsFromChildren(children: ReactNode): DropdownOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child)) {
      return [];
    }
    const label = Children.toArray(child.props.children).join('');
    return [{ value: String(child.props.value ?? label), label }];
  });
}

export function SelectField({
  label,
  error,
  hint,
  className,
  inputClassName = '',
  children,
  value,
  onChange,
  disabled,
}: SelectFieldProps) {
  const modern = useModernLook();
  const options = optionsFromChildren(children);
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      className={className}
      renderControl={(attributes) => (
        <Dropdown
          {...attributes}
          look={modern ? 'modern' : 'default'}
          label={label}
          value={String(value ?? options[0]?.value ?? '')}
          options={options}
          disabled={disabled}
          triggerClassName={inputClassName}
          onChange={(next) =>
            onChange?.({
              target: { value: next },
              currentTarget: { value: next },
            } as ChangeEvent<HTMLSelectElement>)
          }
        />
      )}
    />
  );
}

type TextAreaFieldProps = FieldChrome &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id'> & {
    inputClassName?: string;
  };

export function TextAreaField({
  label,
  error,
  hint,
  className,
  inputClassName = '',
  ...rest
}: TextAreaFieldProps) {
  const modern = useModernLook();
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      className={className}
      renderControl={(attributes) => (
        <textarea
          {...rest}
          {...attributes}
          className={`${modern ? MODERN_CONTROL : CONTROL} ${inputClassName}`.trim()}
        />
      )}
    />
  );
}
