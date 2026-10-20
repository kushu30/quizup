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
import { Dropdown, type DropdownOption } from './Dropdown';

const CONTROL =
  'block w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-muted/70 focus:border-board disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-alert';

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
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={`space-y-1.5 ${className}`.trim()}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {renderControl({
        id,
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
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
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      className={className}
      renderControl={(attributes) => (
        <input {...rest} {...attributes} className={`${CONTROL} ${inputClassName}`.trim()} />
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
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      className={className}
      renderControl={(attributes) => (
        <textarea {...rest} {...attributes} className={`${CONTROL} ${inputClassName}`.trim()} />
      )}
    />
  );
}
