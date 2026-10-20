import type { ExamStudentView } from '@quizup/shared';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { clockLabelFor, formatClock, urgencyOf } from '../../lib/examClock';
import { useProctor } from '../../hooks/useProctor';
import { useServerNow } from '../../hooks/useServerNow';
import type { QuizSocket } from '../../lib/socket';
import { ConnectionBanner } from '../ConnectionBanner';
import { Button, Notice, buttonClasses } from '../ui';

interface ExamAttemptViewProps {
  socket: QuizSocket;
  view: ExamStudentView;
  offsetMs: number;
  connected: boolean;
  proctored: boolean;
  onViewChange: (view: ExamStudentView) => void;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const SUBMIT_FALLBACK_AFTER_MS = 2000;
const SUBMIT_ACK_TIMEOUT_MS = 10_000;
const ANSWER_RETRY_MS = 3000;
const PENDING_NOTICE_AFTER_MS = 3000;

const CLOCK_STYLES = {
  calm: 'bg-board text-white',
  soon: 'bg-marker text-ink',
  urgent: 'bg-alert text-white',
} as const;

const BAR_STYLES = { calm: 'bg-board', soon: 'bg-marker', urgent: 'bg-alert' } as const;

export function ExamAttemptView({
  socket,
  view,
  offsetMs,
  connected,
  proctored,
  onViewChange,
}: ExamAttemptViewProps) {
  const attempt = view.attempt;
  const serverNowMs = useServerNow(offsetMs);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(view.answers);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pendingRef = useRef<Record<string, number>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const viewAnswersRef = useRef(view.answers);
  viewAnswersRef.current = view.answers;
  const offsetRef = useRef(offsetMs);
  offsetRef.current = offsetMs;
  const fallbackSent = useRef(false);
  const submitInFlight = useRef(false);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmTitleId = useId();
  const confirmBodyId = useId();

  const proctor = useProctor({
    enabled: proctored && !submitting,
    connected,
    now: () => Date.now() + offsetRef.current,
    send: (event) => socket.emit('proctor:event', event, () => undefined),
  });

  useEffect(() => {
    setAnswers({ ...view.answers, ...pendingRef.current });
  }, [view.answers]);

  const sendAnswer = useCallback(
    (questionId: string, displayedIndex: number) => {
      socket.emit('exam:answer', { questionId, displayedIndex }, (ack) => {
        if (ack.ok) {
          if (pendingRef.current[questionId] === displayedIndex) {
            delete pendingRef.current[questionId];
            setPendingCount(Object.keys(pendingRef.current).length);
          }
          return;
        }
        if (ack.error === 'attempt_expired') {
          pendingRef.current = {};
          setPendingCount(0);
          setAnswers(viewAnswersRef.current);
          setMessage('Your time is up.');
        }
      });
    },
    [socket],
  );

  const flushPending = useCallback(() => {
    for (const [questionId, displayedIndex] of Object.entries(pendingRef.current)) {
      sendAnswer(questionId, displayedIndex);
    }
  }, [sendAnswer]);

  const hasPending = pendingCount > 0;
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!hasPending) {
      setStuck(false);
      return;
    }
    const timer = setTimeout(() => setStuck(true), PENDING_NOTICE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [hasPending]);

  useEffect(() => {
    if (connected) {
      flushPending();
    }
  }, [connected, flushPending]);

  useEffect(() => {
    if (!connected || !hasPending) {
      return;
    }
    const timer = setInterval(flushPending, ANSWER_RETRY_MS);
    return () => clearInterval(timer);
  }, [connected, hasPending, flushPending]);

  const remainingMs = attempt ? attempt.deadlineAtServerMs - serverNowMs : 0;
  const timeIsUp = remainingMs <= 0;
  const urgency = urgencyOf(remainingMs);
  const clockLabel = clockLabelFor(remainingMs);
  const totalMs = attempt ? attempt.deadlineAtServerMs - attempt.startedAtServerMs : 0;
  const remainingShare = totalMs > 0 ? Math.min(Math.max(remainingMs / totalMs, 0), 1) : 0;

  const submit = useCallback(() => {
    if (submitInFlight.current) {
      return;
    }
    submitInFlight.current = true;
    setConfirmOpen(false);
    setSubmitting(true);
    setMessage(null);
    submitTimer.current = setTimeout(() => {
      submitTimer.current = null;
      submitInFlight.current = false;
      setSubmitting(false);
      setMessage(
        'The server did not confirm your submission. Check your connection and press Submit exam again. Your answers are saved.',
      );
    }, SUBMIT_ACK_TIMEOUT_MS);
    socket.emit('exam:submit', {}, (ack) => {
      if (submitTimer.current) {
        clearTimeout(submitTimer.current);
        submitTimer.current = null;
      }
      submitInFlight.current = false;
      setSubmitting(false);
      if (ack.ok) {
        onViewChange(ack.view);
      } else {
        setMessage('Could not submit. Try again.');
      }
    });
  }, [socket, onViewChange]);

  useEffect(
    () => () => {
      if (submitTimer.current) {
        clearTimeout(submitTimer.current);
      }
    },
    [],
  );

  function closeConfirm() {
    setConfirmOpen(false);
    submitButtonRef.current?.focus();
  }

  useEffect(() => {
    if (timeIsUp && remainingMs < -SUBMIT_FALLBACK_AFTER_MS && !fallbackSent.current) {
      fallbackSent.current = true;
      submit();
    }
  }, [timeIsUp, remainingMs, submit]);

  const question = view.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = view.questions.length - answeredCount;

  function chooseOption(questionId: string, displayedIndex: number) {
    if (timeIsUp || submitting) {
      return;
    }
    setAnswers((current) => ({ ...current, [questionId]: displayedIndex }));
    setMessage(null);
    pendingRef.current[questionId] = displayedIndex;
    setPendingCount(Object.keys(pendingRef.current).length);
    if (connected) {
      sendAnswer(questionId, displayedIndex);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {proctored && proctor.fullscreenLost && (
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

      <div className="sticky top-0 z-10 -mx-4 border-b border-rule bg-paper/95 px-4 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4 pb-3">
          <div
            role="timer"
            aria-label="Time left"
            data-urgency={urgency}
            className={`flex min-w-0 flex-col rounded-lg px-4 py-2 sm:flex-row sm:items-baseline sm:gap-3 ${CLOCK_STYLES[urgency]}`}
          >
            <span className="text-hero leading-none font-bold tabular-nums">
              {formatClock(remainingMs)}
            </span>
            <span className="text-sm font-medium">{clockLabel}</span>
          </div>
          <p className="text-right text-sm font-medium text-muted tabular-nums">
            {answeredCount} of {view.questions.length} answered
          </p>
        </div>
        <div aria-hidden="true" className="-mx-4 h-1.5 bg-rule">
          <div
            className={`h-full ${BAR_STYLES[urgency]}`}
            style={{ width: `${remainingShare * 100}%` }}
          />
        </div>
      </div>
      {clockLabel !== 'Time left' && (
        <p role="status" aria-label="Time warning" className="sr-only">
          {clockLabel}
        </p>
      )}

      {!connected && (
        <ConnectionBanner>
          Connection lost. Reconnecting now. Your timer keeps running. Answers you pick are kept and
          sent when you are back.
        </ConnectionBanner>
      )}
      {pendingCount > 0 && (!connected || stuck) && (
        <p role="status" className="text-sm font-medium text-muted">
          {pendingCount} {pendingCount === 1 ? 'answer' : 'answers'} waiting to send
        </p>
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
                  disabled={timeIsUp || submitting}
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

      <button
        ref={submitButtonRef}
        type="button"
        disabled={submitting || timeIsUp || !connected}
        onClick={() => setConfirmOpen(true)}
        className={`${buttonClasses('brand', 'lg')} w-full`}
      >
        {submitting ? 'Submitting...' : 'Submit exam'}
      </button>
      {!connected && (
        <p className="text-center text-sm text-muted">
          You can submit once you are back online. Your answers are kept.
        </p>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            aria-describedby={confirmBodyId}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                closeConfirm();
              }
            }}
            className="w-full max-w-sm space-y-4 rounded-lg bg-surface p-6"
          >
            <h2 id={confirmTitleId} className="text-xl font-semibold">
              Submit your exam?
            </h2>
            <p id={confirmBodyId} className="text-muted">
              {unansweredCount > 0
                ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. You cannot change answers after submitting.`
                : 'You cannot change answers after submitting.'}
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" autoFocus onClick={closeConfirm}>
                Keep working
              </Button>
              <Button variant="brand" disabled={submitting} onClick={submit}>
                Submit now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
