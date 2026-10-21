import { EXAM_CONSENT_VERSION, type ExamResults, type ExamStudentView } from '@quizup/shared';
import { useEffect, useState } from 'react';
import { usePageFocus } from '../../lib/brandContext';
import { exitFullscreenIfActive } from '../../lib/fullscreen';
import type { QuizSocket } from '../../lib/socket';
import { ctaPrimary, ctaSize } from '../landing/cta';
import { Texture } from '../landing/Texture';
import { CARD, PlayStage, PlayerBar, WaitingDots } from '../play/PlayStage';
import { PageLoader } from '../ui';
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
      <div role="status" className={`${CARD} px-6 py-10 text-center`}>
        <h1 className="text-[1.75rem] font-medium tracking-[-0.03em]">Submitted</h1>
        <p className="mt-2 text-night/60">Submitted. Results will be released by your host.</p>
      </div>
    );
  }
  if (!results) {
    return <PageLoader label="Loading your results..." compact />;
  }
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-night px-6 pt-7 pb-12 text-center text-white">
        <p className="text-sm font-medium text-white/70">Your result</p>
        <p className="mt-1 font-geist-mono text-5xl font-medium tracking-tight tabular-nums">
          {results.score} / {results.total}
        </p>
        <p className="mt-1 text-white/70">{results.correctCount} correct</p>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10">
          <Texture field="rise" color="var(--color-accent-400)" opacity={0.3} cell={3} />
        </div>
      </div>
      <ol className={`${CARD} divide-y divide-dashed divide-night/15 overflow-hidden`}>
        {results.questions.map((question, index) => (
          <li key={question.questionId} className="space-y-1 px-5 py-4">
            <p className="font-medium break-words">
              {index + 1}. {question.stem}
            </p>
            <p className="text-sm break-words text-night/55">
              {question.chosenOption === null
                ? 'No answer'
                : `Your answer: ${question.chosenOption}`}
            </p>
            <p
              className={`text-sm font-medium ${
                question.correct === true
                  ? 'text-accent-700'
                  : question.correct === false
                    ? 'text-alert'
                    : 'text-night/50'
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
      <PlayStage width="sm">
        <PlayerBar name={displayName} standing={null} />
        <div className={`${CARD} px-6 py-10 text-center`}>
          <h1 className="text-[1.75rem] font-medium tracking-[-0.03em]">You are in</h1>
          <p className="mt-2 text-night/60">Waiting for the host to open the exam.</p>
          <div className="mt-5 flex justify-center">
            <WaitingDots />
          </div>
        </div>
      </PlayStage>
    );
  }

  if (view.phase === 'consent') {
    if (declined) {
      return (
        <PlayStage width="sm">
          <PlayerBar name={displayName} standing={null} />
          <div className={`${CARD} space-y-4 px-6 py-8 text-center`}>
            <h1 className="text-[1.75rem] font-medium tracking-[-0.03em]">Exam not started</h1>
            <p className="text-night/60">
              The exam is open but you have not started. Your timer has not begun.
            </p>
            <button
              type="button"
              onClick={() => setDeclined(false)}
              className={`${ctaPrimary} ${ctaSize.lg} w-full`}
            >
              Review and start
            </button>
          </div>
        </PlayStage>
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
      <PlayStage width="lg">
        <ResultsPanel socket={socket} released={view.resultsReleased} />
        <FeedbackForm submit={(payload) => socket.emitWithAck('feedback:submit', payload)} />
      </PlayStage>
    );
  }

  return (
    <PlayStage width="sm">
      <div className={`${CARD} px-6 py-10 text-center`}>
        <h1 className="text-[1.75rem] font-medium tracking-[-0.03em]">Exam closed</h1>
        <p className="mt-2 text-night/60">This exam ended before you started.</p>
      </div>
    </PlayStage>
  );
}
