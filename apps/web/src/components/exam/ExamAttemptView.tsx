import type { ExamStudentView } from '@quizup/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProctor } from '../../hooks/useProctor';
import { useServerNow } from '../../hooks/useServerNow';
import type { QuizSocket } from '../../lib/socket';

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
    <div className="mx-auto max-w-2xl space-y-4">
      {proctor.fullscreenLost && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Full screen required"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="max-w-sm space-y-3 rounded-xl bg-white p-5 text-center">
            <p className="text-lg font-semibold">Return to full screen</p>
            <p className="text-sm text-slate-600">
              The exam is running. Time left: {formatClock(remainingMs)}.
            </p>
            <button
              type="button"
              onClick={() => void proctor.requestFullscreen()}
              className="w-full rounded-md bg-slate-900 px-4 py-3 text-white"
            >
              Go full screen
            </button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2">
        <span className="text-sm text-slate-600">
          {answeredCount} of {view.questions.length} answered
        </span>
        <span
          className={`text-xl font-bold tabular-nums ${remainingMs < 60_000 ? 'text-red-700' : ''}`}
          aria-label="Time left"
        >
          {formatClock(remainingMs)}
        </span>
      </div>

      {!connected && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Reconnecting. Your timer keeps running and your answers are saved when you are back.
        </p>
      )}
      {timeIsUp && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Time is up. Submitting your exam...
        </p>
      )}

      <nav aria-label="Questions" className="flex flex-wrap gap-2">
        {view.questions.map((item, index) => (
          <button
            key={item.questionId}
            type="button"
            onClick={() => setCurrentIndex(index)}
            aria-current={index === currentIndex}
            className={`h-10 w-10 rounded-md border text-sm ${
              index === currentIndex
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300'
            } ${answers[item.questionId] !== undefined && index !== currentIndex ? 'bg-emerald-100' : ''}`}
          >
            {index + 1}
          </button>
        ))}
      </nav>

      {question && (
        <section className="space-y-3">
          <h1 className="text-xl font-semibold">
            {currentIndex + 1}. {question.stem}
          </h1>
          <div className="grid gap-2" role="radiogroup" aria-label="Answer options">
            {question.options.map((option, optionIndex) => (
              <button
                key={OPTION_LETTERS[optionIndex]}
                type="button"
                role="radio"
                aria-checked={answers[question.questionId] === optionIndex}
                disabled={timeIsUp}
                onClick={() => chooseOption(question.questionId, optionIndex)}
                className={`rounded-lg border px-4 py-3 text-left disabled:opacity-60 ${
                  answers[question.questionId] === optionIndex
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                <span className="mr-3 font-bold">{OPTION_LETTERS[optionIndex]}</span>
                {option}
              </button>
            ))}
          </div>
        </section>
      )}

      {message && <p className="text-sm text-red-700">{message}</p>}

      <div className="flex justify-between gap-2">
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
          className="rounded-md border border-slate-300 px-4 py-2 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={currentIndex >= view.questions.length - 1}
          onClick={() => setCurrentIndex((index) => index + 1)}
          className="rounded-md border border-slate-300 px-4 py-2 disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <button
        type="button"
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
        className="w-full rounded-md bg-emerald-600 px-4 py-3 text-lg text-white disabled:opacity-50"
      >
        Submit exam
      </button>
    </div>
  );
}
