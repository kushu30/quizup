import { EXAM_CONSENT_VERSION, type ExamResults, type ExamStudentView } from '@quizup/shared';
import { useEffect, useState } from 'react';
import type { QuizSocket } from '../../lib/socket';
import { ExamAttemptView } from './ExamAttemptView';
import { ExamConsent } from './ExamConsent';

interface ExamPlayProps {
  socket: QuizSocket;
  view: ExamStudentView;
  displayName: string;
  offsetMs: number;
  connected: boolean;
  onViewChange: (view: ExamStudentView) => void;
}

function ResultsPanel({ socket, released }: { socket: QuizSocket; released: boolean }) {
  const [results, setResults] = useState<ExamResults | null>(null);

  useEffect(() => {
    if (!released) {
      setResults(null);
      return;
    }
    socket.emit('exam:results', {}, (ack) => {
      if (ack.ok && ack.released) {
        setResults(ack.results);
      }
    });
  }, [socket, released]);

  if (!released) {
    return (
      <div className="mx-auto max-w-md space-y-2 text-center">
        <h1 className="text-2xl font-bold">Submitted</h1>
        <p className="text-slate-600">Submitted. Results will be released by your host.</p>
      </div>
    );
  }
  if (!results) {
    return <p className="text-center text-slate-600">Loading your results...</p>;
  }
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="rounded-xl bg-slate-900 p-5 text-center text-white">
        <p className="text-sm uppercase tracking-wide">Your result</p>
        <p className="text-4xl font-bold">
          {results.score} / {results.total}
        </p>
        <p className="text-sm">{results.correctCount} correct</p>
      </div>
      <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {results.questions.map((question, index) => (
          <li key={question.questionId} className="space-y-1 px-4 py-3">
            <p className="font-medium">
              {index + 1}. {question.stem}
            </p>
            <p className="text-sm text-slate-600">
              {question.chosenOption === null
                ? 'No answer'
                : `Your answer: ${question.chosenOption}`}
            </p>
            <p
              className={`text-sm font-semibold ${
                question.correct === true ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {question.correct === true
                ? 'Correct'
                : question.correct === false
                  ? 'Incorrect'
                  : 'Not answered'}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ExamPlay({
  socket,
  view,
  displayName,
  offsetMs,
  connected,
  onViewChange,
}: ExamPlayProps) {
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept() {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    setBusy(true);
    setError(null);
    socket.emit('exam:start', { consentVersion: EXAM_CONSENT_VERSION }, (ack) => {
      setBusy(false);
      if (ack.ok) {
        onViewChange(ack.view);
      } else {
        setError('Could not start the exam. Reload the page and try again.');
      }
    });
  }

  if (view.phase === 'waiting') {
    return (
      <div className="mx-auto max-w-md space-y-3 text-center">
        <p className="text-sm text-slate-600">{displayName}</p>
        <h1 className="text-2xl font-bold">You are in!</h1>
        <p className="text-slate-600">Waiting for the host to open the exam.</p>
      </div>
    );
  }

  if (view.phase === 'consent') {
    if (declined) {
      return (
        <div className="mx-auto max-w-md space-y-3 text-center">
          <p className="text-sm text-slate-600">{displayName}</p>
          <h1 className="text-2xl font-bold">Exam not started</h1>
          <p className="text-slate-600">
            The exam is open but you have not started. Your timer has not begun.
          </p>
          <button
            type="button"
            onClick={() => setDeclined(false)}
            className="rounded-md bg-slate-900 px-4 py-3 text-white"
          >
            Review and start
          </button>
        </div>
      );
    }
    return (
      <ExamConsent
        durationMinutes={view.durationMinutes}
        busy={busy}
        error={error}
        onAccept={accept}
        onDecline={() => setDeclined(true)}
      />
    );
  }

  if (view.phase === 'in_progress') {
    return (
      <ExamAttemptView
        socket={socket}
        view={view}
        offsetMs={offsetMs}
        connected={connected}
        onViewChange={onViewChange}
      />
    );
  }

  if (view.phase === 'submitted') {
    return <ResultsPanel socket={socket} released={view.resultsReleased} />;
  }

  return (
    <div className="mx-auto max-w-md space-y-2 text-center">
      <h1 className="text-2xl font-bold">Exam closed</h1>
      <p className="text-slate-600">This exam ended before you started.</p>
    </div>
  );
}
