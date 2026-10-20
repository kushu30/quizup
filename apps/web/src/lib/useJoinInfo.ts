import type { JoinInfo } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { fetchJoinInfo } from './joinInfoClient';

const LOOKUP_DELAY_MS = 250;
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function useJoinInfo(rawCode: string): JoinInfo | null {
  const code = rawCode.trim().toUpperCase();
  const valid = CODE_PATTERN.test(code);
  const [found, setFound] = useState<{ code: string; info: JoinInfo | null }>({
    code: '',
    info: null,
  });

  useEffect(() => {
    if (!valid) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchJoinInfo(code).then((info) => {
        if (!cancelled) {
          setFound({ code, info });
        }
      });
    }, LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, valid]);

  return valid && found.code === code ? found.info : null;
}
