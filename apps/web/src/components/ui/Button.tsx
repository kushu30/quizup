import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'brand' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink/90',
  brand: 'bg-board text-white hover:bg-board-strong',
  accent: 'bg-marker text-ink hover:bg-marker/85',
  secondary: 'border border-rule-strong bg-surface text-ink hover:bg-paper',
  ghost: 'text-ink hover:bg-ink/5',
  danger: 'border border-alert/40 bg-surface text-alert hover:bg-alert-soft',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 text-sm',
  md: 'min-h-10 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClasses(variant, size)} ${className}`.trim()}
      {...rest}
    />
  );
}
