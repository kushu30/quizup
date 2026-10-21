import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  id?: string;
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  // The redesigned look. Pages that have not been redesigned keep the original one.
  look?: 'default' | 'modern';
  // In the modern look: a compact control for toolbars, or a form-sized one.
  size?: 'md' | 'lg';
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Dropdown({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
  triggerClassName = '',
  look = 'default',
  size = 'md',
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: DropdownProps) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const modern = look === 'modern';
  const [active, setActive] = useState(0);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
    }
  });

  function openList() {
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    triggerRef.current?.focus();
    if (option) {
      onChange(option.value);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((current) => Math.min(current + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((current) => Math.max(current - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const letter = event.key.toLowerCase();
          const ordered = [...options.keys()];
          const rotated = [...ordered.slice(active + 1), ...ordered.slice(0, active + 1)];
          const next = rotated.find((index) =>
            options[index]?.label.toLowerCase().startsWith(letter),
          );
          if (next !== undefined) {
            setActive(next);
          }
        }
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        className={`group flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed ${
          modern
            ? `${size === 'lg' ? 'h-12 rounded-xl px-4 text-base' : 'h-10 rounded-[0.8rem] px-3.5 text-[0.9375rem]'} bg-white text-night shadow-[0_0_0_1px_rgba(17,16,20,0.12)] transition-shadow duration-200 ease-soft hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none disabled:text-night/40`
            : 'rounded-md border border-rule-strong bg-surface px-3 py-2 text-base text-ink transition-colors hover:border-board focus:border-board disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-alert'
        } ${triggerClassName}`.trim()}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ''}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            modern ? 'text-night/40 ease-soft' : 'text-muted'
          } ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          className={`animate-pop absolute z-30 mt-1.5 max-h-64 w-full min-w-40 overflow-auto p-1 ${
            modern
              ? 'rounded-xl bg-white font-geist shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_16px_32px_-12px_rgba(17,16,20,0.25)]'
              : 'rounded-lg border border-rule bg-surface shadow-lg'
          }`}
        >
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${
                  modern
                    ? `rounded-lg text-[0.9375rem] text-night transition-colors duration-150 ${
                        index === active ? 'bg-night/[0.05]' : ''
                      } ${isSelected ? 'font-medium' : ''}`
                    : `rounded-md text-base ${index === active ? 'bg-board-soft text-ink' : 'text-ink'} ${
                        isSelected ? 'font-semibold' : ''
                      }`
                }`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 12 12"
                    className={`h-3.5 w-3.5 shrink-0 ${modern ? 'text-accent-600' : 'text-board'}`}
                  >
                    <path
                      d="M2.5 6.5 5 9l4.5-5.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
