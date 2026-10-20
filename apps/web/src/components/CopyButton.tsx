import { useEffect, useRef, useState } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from './ui';

const RESET_AFTER_MS = 2000;

interface CopyButtonProps {
  text: string;
  label: string;
  copiedMessage?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  statusClassName?: string;
}

export function CopyButton({
  text,
  label,
  copiedMessage = 'Link copied',
  variant = 'secondary',
  size = 'md',
  className = '',
  statusClassName = 'text-sm text-muted',
}: CopyButtonProps) {
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  async function copy() {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(copiedMessage);
      timer.current = setTimeout(() => setStatus(''), RESET_AFTER_MS);
    } catch {
      setStatus('Copy failed. Select the link and copy it.');
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <Button variant={variant} size={size} className={className} onClick={() => void copy()}>
        {label}
      </Button>
      <span role="status" className={statusClassName}>
        {status}
      </span>
    </span>
  );
}
