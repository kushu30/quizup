import { EXAM_CONSENT_VERSION, type ExamResults, type ExamStudentView } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { usePageFocus } from '../../lib/brandContext';
import { exitFullscreenIfActive } from '../../lib/fullscreen';
import type { QuizSocket } from '../../lib/socket';
import { PageLoader, buttonClasses } from '../ui';
import { FeedbackForm } from '../FeedbackForm';
import { ExamAttemptView } from './ExamAttemptView';
import { ExamConsent } from './ExamConsent';

interface ExamPlayProps {
  socket: QuizSocket;
  view: ExamStudentView;
  displayName: string;
  offsetMs: number;
  connected: boolean;
  proctored: boolean;
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
      <div role="status" className="mx-auto max-w-md space-y-2 py-12 text-center">
        <h1 className="text-title font-semibold tracking-tight">Submitted</h1>
        <p className="text-lg text-muted">Submitted. Results will be released by your host.</p>
      </div>
    );
  }
  if (!results) {
    return <PageLoader label="Loading your results..." compact />;
  }
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-lg bg-board p-6 text-center text-white">
        <p className="text-base font-medium text-white/85">Your result</p>
        <p className="text-hero font-bold tabular-nums">
          {results.score} / {results.total}
        </p>
        <p className="text-white/85">{results.correctCount} correct</p>
      </div>
      <ol className="divide-y divide-rule rounded-lg border border-rule bg-surface">
        {results.questions.map((question, index) => (
          <li key={question.questionId} className="space-y-1 px-5 py-4">
            <p className="font-semibold break-words">
              {index + 1}. {question.stem}
            </p>
            <p className="text-sm text-muted break-words">
              {question.chosenOption === null
                ? 'No answer'
                : `Your answer: ${question.chosenOption}`}
            </p>
            <p
              className={`text-sm font-semibold ${
                question.correct === true ? 'text-success' : 'text-alert'
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
  proctored,
  onViewChange,
}: ExamPlayProps) {
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const examOver = view.phase === 'submitted' || view.phase === 'closed';
  usePageFocus(view.phase === 'in_progress');

  useEffect(() => {
    if (examOver) {
      exitFullscreenIfActive();
    }
  }, [examOver]);

  function accept() {
    if (proctored) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
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
      <div className="mx-auto max-w-md space-y-3 py-12 text-center">
        <p className="text-sm font-semibold">{displayName}</p>
        <h1 className="text-title font-semibold tracking-tight">You are in</h1>
        <p className="text-lg text-muted">Waiting for the host to open the exam.</p>
      </div>
    );
  }

  if (view.phase === 'consent') {
    if (declined) {
      return (
        <div className="mx-auto max-w-md space-y-4 py-12 text-center">
          <p className="text-sm font-semibold">{displayName}</p>
          <h1 className="text-title font-semibold tracking-tight">Exam not started</h1>
          <p className="text-lg text-muted">
            The exam is open but you have not started. Your timer has not begun.
          </p>
          <button
            type="button"
            onClick={() => setDeclined(false)}
            className={buttonClasses('brand', 'lg')}
          >
            Review and start
          </button>
        </div>
      );
    }
    return (
      <ExamConsent
        durationMinutes={view.durationMinutes}
        proctored={proctored}
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
        proctored={proctored}
        onViewChange={onViewChange}
      />
    );
  }

  if (view.phase === 'submitted') {
    return (
      <div className="space-y-8">
        <ResultsPanel socket={socket} released={view.resultsReleased} />
        <div className="mx-auto max-w-2xl">
          <FeedbackForm submit={(payload) => socket.emitWithAck('feedback:submit', payload)} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-2 py-12 text-center">
      <h1 className="text-title font-semibold tracking-tight">Exam closed</h1>
      <p className="text-lg text-muted">This exam ended before you started.</p>
    </div>
  );
}
