import type { ExamStudentView } from '@quizup/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProctor } from '../../hooks/useProctor';
import { useServerNow } from '../../hooks/useServerNow';
import type { QuizSocket } from '../../lib/socket';
import { Button, Notice } from '../ui';

interface ExamAttemptViewProps {
  socket: QuizSocket;
  view: ExamStudentView;
  offsetMs: number;
  connected: boolean;
  onViewChange: (view: ExamStudentView) => void;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const SUBMIT_FALLBACK_AFTER_MS = 2000;

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(Math.ceil(milliseconds / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ExamAttemptView({
  socket,
  view,
  offsetMs,
  connected,
  onViewChange,
}: ExamAttemptViewProps) {
  const attempt = view.attempt;
  const serverNowMs = useServerNow(offsetMs);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(view.answers);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const offsetRef = useRef(offsetMs);
  offsetRef.current = offsetMs;
  const fallbackSent = useRef(false);

  const proctor = useProctor({
    enabled: true,
    connected,
    now: () => Date.now() + offsetRef.current,
    send: (event) => socket.emit('proctor:event', event, () => undefined),
  });

  useEffect(() => {
    setAnswers(view.answers);
  }, [view.answers]);

  const remainingMs = attempt ? attempt.deadlineAtServerMs - serverNowMs : 0;
  const timeIsUp = remainingMs <= 0;

  const submit = useCallback(() => {
    setSubmitting(true);
    socket.emit('exam:submit', {}, (ack) => {
      setSubmitting(false);
      if (ack.ok) {
        onViewChange(ack.view);
      } else {
        setMessage('Could not submit. Try again.');
      }
    });
  }, [socket, onViewChange]);

  useEffect(() => {
    if (timeIsUp && remainingMs < -SUBMIT_FALLBACK_AFTER_MS && !fallbackSent.current) {
      fallbackSent.current = true;
      submit();
    }
  }, [timeIsUp, remainingMs, submit]);

  const question = view.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;

  function chooseOption(questionId: string, displayedIndex: number) {
    if (timeIsUp) {
      return;
    }
    const previous = answers[questionId];
    setAnswers((current) => ({ ...current, [questionId]: displayedIndex }));
    setMessage(null);
    socket.emit('exam:answer', { questionId, displayedIndex }, (ack) => {
      if (!ack.ok) {
        setAnswers((current) => {
          const next = { ...current };
          if (previous === undefined) {
            delete next[questionId];
          } else {
            next[questionId] = previous;
          }
          return next;
        });
        setMessage(
          ack.error === 'attempt_expired'
            ? 'Your time is up.'
            : 'Your answer was not saved. Try again.',
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {proctor.fullscreenLost && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Full screen required"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4"
        >
          <div className="max-w-sm space-y-4 rounded-lg bg-surface p-6 text-center">
            <p className="text-xl font-semibold">Return to full screen</p>
            <p className="text-muted">
              The exam is still running. Time left:{' '}
              <span className="font-semibold text-ink tabular-nums">
                {formatClock(remainingMs)}
              </span>
            </p>
            <Button
              variant="brand"
              size="lg"
              className="w-full"
              onClick={() => void proctor.requestFullscreen()}
            >
              Go full screen
            </Button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur">
        <span className="text-sm font-medium text-muted tabular-nums">
          {answeredCount} of {view.questions.length} answered
        </span>
        <span
          className={`text-title font-bold tabular-nums ${remainingMs < 60_000 ? 'text-alert' : ''}`}
          aria-label="Time left"
        >
          {formatClock(remainingMs)}
        </span>
      </div>

      {!connected && (
        <Notice tone="warning">
          Reconnecting. Your timer keeps running and your answers are saved when you are back.
        </Notice>
      )}
      {timeIsUp && <Notice tone="warning">Time is up. Submitting your exam...</Notice>}

      <nav aria-label="Questions" className="flex flex-wrap gap-2">
        {view.questions.map((item, index) => {
          const answered = answers[item.questionId] !== undefined;
          const current = index === currentIndex;
          return (
            <button
              key={item.questionId}
              type="button"
              onClick={() => setCurrentIndex(index)}
              aria-current={current}
              aria-label={`Question ${index + 1}${answered ? ', answered' : ''}`}
              className={`h-10 w-10 rounded-md border text-sm font-semibold tabular-nums ${
                current
                  ? 'border-ink bg-ink text-white'
                  : answered
                    ? 'border-board bg-board-soft text-board'
                    : 'border-rule-strong bg-surface text-ink hover:bg-paper'
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>

      {question && (
        <section className="space-y-4">
          <h1 className="text-xl font-semibold break-words sm:text-2xl">
            <span className="mr-2 text-muted">{currentIndex + 1}.</span>
            {question.stem}
          </h1>
          <div className="grid gap-3" role="radiogroup" aria-label="Answer options">
            {question.options.map((option, optionIndex) => {
              const checked = answers[question.questionId] === optionIndex;
              return (
                <button
                  key={OPTION_LETTERS[optionIndex]}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={timeIsUp}
                  onClick={() => chooseOption(question.questionId, optionIndex)}
                  className={`flex items-center gap-4 rounded-lg border-2 px-4 py-3.5 text-left text-base break-words disabled:cursor-not-allowed disabled:opacity-60 ${
                    checked
                      ? 'border-board bg-board-soft'
                      : 'border-rule bg-surface hover:border-rule-strong'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                      checked ? 'bg-board text-white' : 'bg-paper text-muted'
                    }`}
                  >
                    {OPTION_LETTERS[optionIndex]}
                  </span>
                  <span className="min-w-0">{option}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {message && <Notice tone="danger">{message}</Notice>}

      <div className="flex justify-between gap-2">
        <Button
          variant="secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={currentIndex >= view.questions.length - 1}
          onClick={() => setCurrentIndex((index) => index + 1)}
        >
          Next
        </Button>
      </div>

      <Button
        variant="brand"
        size="lg"
        className="w-full"
        disabled={submitting || timeIsUp}
        onClick={() => {
          const unanswered = view.questions.length - answeredCount;
          const warning =
            unanswered > 0
              ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Submit anyway?`
              : 'Submit your exam? You cannot change answers afterwards.';
          if (window.confirm(warning)) {
            submit();
          }
        }}
      >
        Submit exam
      </Button>
    </div>
  );
}
