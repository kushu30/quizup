import { useEffect, useRef, useState } from 'react';

const FADE_MS = 300;

// Clears a message after a while so it does not stay on screen. Returns true for the last
// moment before it goes, so the message can fade out instead of vanishing.
export function useAutoDismiss(message: unknown, clear: () => void, after = 8000): boolean {
  const [fading, setFading] = useState(false);
  const clearRef = useRef(clear);
  clearRef.current = clear;

  useEffect(() => {
    setFading(false);
    if (!message) {
      return;
    }
    const fade = setTimeout(() => setFading(true), after - FADE_MS);
    const done = setTimeout(() => clearRef.current(), after);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [message, after]);

  return fading;
}
