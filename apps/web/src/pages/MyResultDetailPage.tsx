import type { StudentResult } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RequireRole } from '../components/RequireRole';
import { StudentResultView } from '../components/StudentResultView';
import { Notice, PageHeader, PageLoader } from '../components/ui';
import { ApiError, api, describeError } from '../lib/api';

const NOT_READY_TEXT: Record<string, string> = {
  results_not_released: 'Your host has not released the results yet. Check back later.',
  session_not_finished: 'This assessment is still running. Your result appears when it ends.',
};

function MyResultDetailContent() {
  const { sessionId = '' } = useParams();
  const [result, setResult] = useState<StudentResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMyResult(sessionId)
      .then((loaded) => {
        if (!cancelled) {
          setResult(loaded);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setMessage('We could not find this result. It may belong to another account.');
        } else if (error instanceof ApiError && error.status === 409) {
          setMessage(NOT_READY_TEXT[error.code ?? ''] ?? describeError(error));
        } else {
          setMessage(describeError(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div>
      <PageHeader
        title={result?.quizTitle ?? 'Your result'}
        description={
          result
            ? `${result.mode === 'exam' ? 'Timed exam' : 'Quiz'} result for ${result.displayName}`
            : undefined
        }
        back={{ to: '/me/results', label: 'Back to my results' }}
      />
      {message && <Notice tone="info">{message}</Notice>}
      {!result && !message && <PageLoader label="Loading your result" />}
      {result && <StudentResultView result={result} audience="student" />}
    </div>
  );
}

export function MyResultDetailPage() {
  return (
    <RequireRole roles={['student', 'host', 'admin']} deniedNotice="Sign in first.">
      <MyResultDetailContent />
    </RequireRole>
  );
}
