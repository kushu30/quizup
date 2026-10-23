import type { ExamStudentView } from '@quizup/shared';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { clockLabelFor, formatClock, urgencyOf } from '../../lib/examClock';
import { useProctor } from '../../hooks/useProctor';
import { useServerNow } from '../../hooks/useServerNow';
import type { QuizSocket } from '../../lib/socket';
import { ConnectionBanner } from '../ConnectionBanner';
import { QuestionImage } from '../QuestionImage';
import { ctaLight, ctaPrimary, ctaSize } from '../landing/cta';
import { CARD, PlayStage } from '../play/PlayStage';
import { MediaProctorLayer } from '../proctor/MediaProctorLayer';
import { Notice } from '../ui';

interface ExamAttemptViewProps {
  socket: QuizSocket;
  view: ExamStudentView;
  offsetMs: number;
  connected: boolean;
  proctored: boolean;
  /** Which devices the host turned on, and the auto-submit limit, if any. */
  media?: { camera: boolean; mic: boolean; flagLimit: number | null };
  onViewChange: (view: ExamStudentView) => void;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const SUBMIT_FALLBACK_AFTER_MS = 2000;
const SUBMIT_ACK_TIMEOUT_MS = 10_000;
const ANSWER_RETRY_MS = 3000;
const PENDING_NOTICE_AFTER_MS = 3000;

const CLOCK_STYLES = {
  calm: 'bg-night text-white',
  soon: 'bg-amber-400 text-night',
  urgent: 'bg-alert text-white',
} as const;

const BAR_STYLES = { calm: 'bg-night/70', soon: 'bg-amber-400', urgent: 'bg-alert' } as const;

export function ExamAttemptView({
  socket,
  view,
  offsetMs,
  connected,
  proctored,
  media,
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
    <PlayStage width="lg">
      {proctored && proctor.fullscreenLost && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Full screen required"
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/60 p-4 backdrop-blur-[2px]"
        >
          <div className={`${CARD} max-w-sm animate-pop space-y-4 p-6 text-center`}>
            <p className="text-xl font-medium tracking-tight">Return to full screen</p>
            <p className="text-night/60">
              The exam is still running. Time left:{' '}
              <span className="font-geist-mono font-medium text-night tabular-nums">
                {formatClock(remainingMs)}
              </span>
            </p>
            <button
              type="button"
              className={`${ctaPrimary} ${ctaSize.lg} w-full`}
              onClick={() => void proctor.requestFullscreen()}
            >
              Go full screen
            </button>
          </div>
        </div>
      )}

      <div className={`${CARD} sticky top-14 z-30 overflow-hidden`}>
        <div className="flex items-center justify-between gap-4 px-3 py-3 sm:px-4">
          <div
            role="timer"
            aria-label="Time left"
            data-urgency={urgency}
            className={`flex min-w-0 flex-col rounded-xl px-4 py-2 transition-colors duration-500 ease-soft sm:flex-row sm:items-baseline sm:gap-3 ${CLOCK_STYLES[urgency]}`}
          >
            <span className="font-geist-mono text-3xl leading-none font-medium tabular-nums">
              {formatClock(remainingMs)}
            </span>
            <span className="text-sm font-medium">{clockLabel}</span>
          </div>
          <p className="text-right text-sm font-medium text-night/60 tabular-nums">
            {answeredCount} of {view.questions.length} answered
          </p>
        </div>
        {proctored && media && (media.camera || media.mic) && (
          <div className="px-3 pb-3 sm:px-4">
            <MediaProctorLayer
              socket={socket}
              room={{
                proctorCamera: media.camera,
                proctorMic: media.mic,
                proctorFlagLimit: media.flagLimit,
              }}
              active={!submitting}
              connected={connected}
              now={() => Date.now() + offsetRef.current}
            />
          </div>
        )}
        <div aria-hidden="true" className="h-1 bg-night/[0.07]">
          <div
            className={`h-full transition-[width] duration-1000 ease-linear ${BAR_STYLES[urgency]}`}
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
        <p role="status" className="text-sm font-medium text-night/60">
          {pendingCount} {pendingCount === 1 ? 'answer' : 'answers'} waiting to send
        </p>
      )}
      {timeIsUp && <Notice tone="warning">Time is up. Submitting your exam...</Notice>}

      <nav aria-label="Questions" className={`${CARD} flex flex-wrap gap-2 p-3`}>
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
              className={`h-10 w-10 rounded-xl font-geist-mono text-sm font-medium tabular-nums transition-[background-color,box-shadow,color] duration-200 ease-soft ${
                current
                  ? 'bg-night text-white'
                  : answered
                    ? 'bg-accent-50 text-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent-200)]'
                    : 'bg-white text-night/70 shadow-[0_0_0_1px_rgba(17,16,20,0.14)] hover:shadow-[0_0_0_1px_rgba(17,16,20,0.35)]'
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>

      {question && (
        <section className="space-y-3">
          <div className={`${CARD} space-y-4 p-5 sm:p-6`}>
            <h1 className="text-xl leading-snug font-medium tracking-tight break-words [overflow-wrap:anywhere] sm:text-2xl">
              <span className="mr-2 font-geist-mono text-night/35">{currentIndex + 1}.</span>
              {question.stem}
            </h1>
            <QuestionImage imageUrl={question.imageUrl} imageAlt={question.imageAlt} />
          </div>
          <div className="grid gap-2.5" role="radiogroup" aria-label="Answer options">
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
                  className={`flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left text-base break-words transition-[background-color,box-shadow,color] duration-200 ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night disabled:cursor-not-allowed disabled:opacity-60 ${
                    checked
                      ? 'bg-night text-white shadow-[0_0_0_1px_rgba(17,16,20,1)]'
                      : 'bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.12),0_1px_3px_rgba(17,16,20,0.05)] hover:shadow-[0_0_0_1.5px_rgba(17,16,20,0.45)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-geist-mono text-sm font-medium ${
                      checked ? 'bg-white/15 text-white' : 'bg-night/[0.06] text-night/60'
                    }`}
                  >
                    {OPTION_LETTERS[optionIndex]}
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{option}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {message && <Notice tone="danger">{message}</Notice>}

      <div className="flex justify-between gap-2">
        <button
          type="button"
          className={`${ctaLight} ${ctaSize.md}`}
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
        >
          Previous
        </button>
        <button
          type="button"
          className={`${ctaLight} ${ctaSize.md}`}
          disabled={currentIndex >= view.questions.length - 1}
          onClick={() => setCurrentIndex((index) => index + 1)}
        >
          Next
        </button>
      </div>

      <button
        ref={submitButtonRef}
        type="button"
        disabled={submitting || timeIsUp || !connected}
        onClick={() => setConfirmOpen(true)}
        className={`${ctaPrimary} ${ctaSize.lg} w-full`}
      >
        {submitting ? 'Submitting...' : 'Submit exam'}
      </button>
      {!connected && (
        <p className="text-center text-sm text-night/55">
          You can submit once you are back online. Your answers are kept.
        </p>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-night/50 p-4 backdrop-blur-[2px]">
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
            className={`${CARD} w-full max-w-sm animate-pop space-y-4 p-6 shadow-[0_24px_60px_-20px_rgba(17,16,20,0.45)]`}
          >
            <h2 id={confirmTitleId} className="text-[1.375rem] font-medium tracking-tight">
              Submit your exam?
            </h2>
            <p id={confirmBodyId} className="leading-relaxed text-night/60">
              {unansweredCount > 0
                ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. You cannot change answers after submitting.`
                : 'You cannot change answers after submitting.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                className={`${ctaLight} ${ctaSize.md}`}
                autoFocus
                onClick={closeConfirm}
              >
                Keep working
              </button>
              <button
                type="button"
                className={`${ctaPrimary} ${ctaSize.md}`}
                disabled={submitting}
                onClick={submit}
              >
                Submit now
              </button>
            </div>
          </div>
        </div>
      )}
    </PlayStage>
  );
}
