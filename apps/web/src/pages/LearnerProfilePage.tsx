import { useState } from 'react';
import { RequireRole } from '../components/RequireRole';
import { api, describeError } from '../lib/api';

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
      setMessage('Your learner profile was erased.');
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="text-2xl font-bold">My learning data</h1>
      <p className="text-slate-600">
        When you join an adaptive session while signed in, QuizUp remembers a skill rating and a
        mastery estimate per topic so your next session can start closer to your level. It is never
        shown to other students. You can erase it at any time.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleErase()}
        className="rounded-md border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50"
      >
        Erase my learner profile
      </button>
      {message && <p className="text-sm text-slate-700">{message}</p>}
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
