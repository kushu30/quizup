import { useState } from 'react';
import { RequireRole } from '../components/RequireRole';
import { Button, Notice, PageHeader } from '../components/ui';
import { api, describeError } from '../lib/api';

const ERASED_MESSAGE = 'Your learner profile was erased.';

function LearnerProfileContent() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleErase() {
    if (!window.confirm('Erase your learner profile? This cannot be undone.')) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteLearnerProfile();
      setMessage(ERASED_MESSAGE);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="My learning data" />
      <div className="max-w-prose space-y-5">
        <p className="text-lg">
          When you join an adaptive session while signed in, QuizUp remembers a skill rating and a
          mastery estimate per topic so your next session can start closer to your level. It is
          never shown to other students. You can erase it at any time.
        </p>
        <Button variant="danger" disabled={busy} onClick={() => void handleErase()}>
          Erase my learner profile
        </Button>
        {message && (
          <Notice tone={message === ERASED_MESSAGE ? 'success' : 'danger'}>{message}</Notice>
        )}
      </div>
    </div>
  );
}

export function LearnerProfilePage() {
  return (
    <RequireRole roles={['student', 'host', 'admin']} deniedNotice="Sign in first.">
      <LearnerProfileContent />
    </RequireRole>
  );
}
