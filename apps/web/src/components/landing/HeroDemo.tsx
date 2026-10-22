import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ctaPrimary, ctaSize } from './cta';

const CODE = 'K7M2QX';
const QUESTION = 'Which isolation level prevents dirty reads but allows non-repeatable reads?';
const OPTIONS = ['Read committed', 'Read uncommitted', 'Serializable', 'Repeatable read'];
const CORRECT = 0;
const ANSWER_SECONDS = 15;
const TICK_MS = 700;

// Seven classmates answer one by one while the question is open; the visitor makes the eighth.
const OTHER_ANSWERS = [0, 0, 2, 0, 3, 0, 1];
const JOINED = ['Asha', 'Ben', 'Chen', 'Dana'];
const OTHER_SCORES = [
  { name: 'Asha', score: 4820 },
  { name: 'Ben', score: 4310 },
  { name: 'Chen', score: 3975 },
  { name: 'Dana', score: 3540 },
];

const STEPS = [
  { label: 'Share the code', ms: 4200 },
  { label: 'Students answer', ms: 7500 },
  { label: 'See the result', ms: 4200 },
  { label: 'Leaderboard', ms: 5000 },
];

const SURFACE =
  'shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_1px_2px_rgba(17,16,20,0.04)] bg-white rounded-xl';

// A small, working copy of a live session: the host's screen beside a student's phone. Tap an
// answer on the phone and the host's chart moves with it. It plays through by itself until the
// visitor takes over.
export function HeroDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function goTo(next: number) {
    setStep(next);
    setPicked(null);
    setTick(0);
  }

  // Answers and joins trickle in on a steady beat, but only while the demo is on screen.
  useEffect(() => {
    if (!visible || (step !== 0 && step !== 1)) {
      return;
    }
    const timer = setInterval(() => setTick((current) => current + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [visible, step]);

  useEffect(() => {
    if (!playing || !visible) {
      return;
    }
    const timer = setTimeout(() => goTo((step + 1) % STEPS.length), STEPS[step]!.ms);
    return () => clearTimeout(timer);
  }, [playing, visible, step]);

  // Picking an answer moves things along after a beat, whether or not the demo is playing.
  useEffect(() => {
    if (step !== 1 || picked === null) {
      return;
    }
    const timer = setTimeout(() => {
      setStep(2);
      setTick(0);
    }, 1100);
    return () => clearTimeout(timer);
  }, [step, picked]);

  function takeOver() {
    setPlaying(false);
  }

  function pick(index: number) {
    takeOver();
    setPicked(index);
  }

  const others = step === 1 ? OTHER_ANSWERS.slice(0, tick) : OTHER_ANSWERS;
  const votes = OPTIONS.map(
    (_, index) => others.filter((answer) => answer === index).length + (picked === index ? 1 : 0),
  );
  const answered = others.length + (picked === null ? 0 : 1);
  const total = OTHER_ANSWERS.length + 1;
  const secondsLeft = Math.max(ANSWER_SECONDS - Math.floor((tick * TICK_MS) / 1000), 0);
  const youCorrect = picked === CORRECT || picked === null;
  const standings = [
    { name: 'You', score: youCorrect ? 4640 : 3120, you: true },
    ...OTHER_SCORES.map((entry) => ({ ...entry, you: false })),
  ].sort((first, second) => second.score - first.score);
  const place = standings.findIndex((entry) => entry.you) + 1;

  const hostScreen = (
    <div className="flex min-h-[19rem] flex-col">
      {step === 0 && (
        <div className="flex flex-1 flex-col justify-center gap-6">
          <div>
            <p className="text-sm text-night/50">Join at quizup.app/join with the code</p>
            <p className="mt-2 font-geist-mono text-[2.75rem] leading-none font-medium tracking-[0.18em] sm:text-5xl">
              {CODE}
            </p>
          </div>
          <div>
            <p className="text-sm text-night/50">
              <span className="font-medium text-night tabular-nums">
                {Math.min(tick, JOINED.length)}
              </span>{' '}
              in the lobby
            </p>
            <ul className="mt-2 flex min-h-8 flex-wrap gap-1.5">
              {JOINED.slice(0, tick).map((name) => (
                <li
                  key={name}
                  className="animate-pop rounded-lg bg-night/[0.05] px-2.5 py-1 text-sm text-night/80"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {(step === 1 || step === 2) && (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between text-sm text-night/50">
            <span>Question 4 of 10</span>
            {step === 1 ? (
              <span className="rounded-md bg-night px-2 py-0.5 font-geist-mono text-xs text-white tabular-nums">
                0:{String(secondsLeft).padStart(2, '0')}
              </span>
            ) : (
              <span className="font-medium text-accent-700">
                {votes[CORRECT]} of {total} got it
              </span>
            )}
          </div>
          <p className="mt-3 text-[0.9375rem] leading-snug font-medium">{QUESTION}</p>
          <p className="mt-3 text-sm text-night/50 tabular-nums">
            {answered} of {total} answered
          </p>
          <ul className="mt-3 space-y-2.5">
            {OPTIONS.map((option, index) => {
              const isCorrect = step === 2 && index === CORRECT;
              return (
                <li key={option} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-geist-mono text-[11px] ${
                      isCorrect ? 'bg-accent-600 text-white' : 'bg-night/[0.06] text-night/60'
                    }`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="w-28 shrink-0 truncate sm:w-32">{option}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-night/[0.06]">
                    <span
                      className={`block h-full rounded-full transition-[width] duration-500 ease-out ${
                        isCorrect ? 'bg-accent-500' : 'bg-night/40'
                      }`}
                      style={{ width: `${(votes[index]! / total) * 100}%` }}
                    />
                  </span>
                  <span className="w-4 text-right font-geist-mono text-xs text-night/50 tabular-nums">
                    {votes[index]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1">
          <p className="text-sm text-night/50">Final leaderboard</p>
          <ol className="mt-3 space-y-1.5">
            {standings.map((entry, index) => (
              <li
                key={entry.name}
                className={`animate-rise-in flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  entry.you
                    ? 'bg-accent-50 font-medium shadow-[inset_0_0_0_1px_var(--color-accent-200)]'
                    : 'bg-night/[0.03]'
                }`}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <span className="flex items-center gap-2.5">
                  <span className="w-3 font-geist-mono text-xs text-night/45">{index + 1}</span>
                  {entry.name}
                </span>
                <span className="font-geist-mono text-xs text-night/55 tabular-nums">
                  {entry.score.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );

  const phoneScreen = (
    <div className="flex h-full min-h-[19rem] flex-col">
      {step === 0 && (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <p className="text-base font-medium">Join a quiz</p>
          <p className="rounded-lg bg-night/[0.04] px-3 py-2.5 text-center font-geist-mono text-lg tracking-[0.2em] shadow-[inset_0_0_0_1px_rgba(17,16,20,0.06)]">
            {CODE}
          </p>
          <button
            type="button"
            onClick={() => {
              takeOver();
              goTo(1);
            }}
            className={`${ctaPrimary} ${ctaSize.md} w-full`}
          >
            Join
          </button>
        </div>
      )}
      {step === 1 && (
        <div className="flex flex-1 flex-col">
          <p className="text-xs text-night/50">Tap an answer</p>
          <p className="mt-1.5 text-[0.8125rem] leading-snug font-medium">{QUESTION}</p>
          <ul className="mt-3 grid gap-1.5">
            {OPTIONS.map((option, index) => (
              <li key={option}>
                <button
                  type="button"
                  disabled={picked !== null}
                  onClick={() => pick(index)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] transition-[background-color,box-shadow] duration-150 ${
                    picked === index
                      ? 'bg-night text-white'
                      : 'bg-white shadow-[inset_0_0_0_1px_rgba(17,16,20,0.12)] hover:shadow-[inset_0_0_0_1px_rgba(17,16,20,0.4)] disabled:opacity-50'
                  }`}
                >
                  <span className="font-geist-mono text-[11px] opacity-60">
                    {String.fromCharCode(65 + index)}
                  </span>
                  {option}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {step === 2 && (
        <div
          role="status"
          className={`animate-pop my-auto rounded-xl p-5 text-center text-white ${
            youCorrect ? 'bg-accent-600' : 'bg-alert'
          }`}
        >
          <p className="text-lg font-medium">{youCorrect ? 'Correct' : 'Not quite'}</p>
          <p className="mt-1 font-geist-mono text-sm tabular-nums">
            {youCorrect ? '+820 points' : '+0 points'}
          </p>
          <p className="mt-2 text-xs text-white/80">The answer was A, {OPTIONS[CORRECT]}.</p>
        </div>
      )}
      {step === 3 && (
        <div className="my-auto text-center">
          <p className="font-geist-mono text-4xl font-light tabular-nums">#{place}</p>
          <p className="mt-1 text-sm text-night/55">out of {total} students</p>
          <p className="mt-4 text-xs text-night/45">Then a short anonymous feedback form.</p>
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="mx-auto max-w-5xl text-left">
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_24px_48px_-32px_rgba(17,16,20,0.35)]">
        <div className="flex items-center gap-3 border-b border-dashed border-night/15 px-4 py-2.5">
          <span aria-hidden="true" className="flex gap-1.5">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="h-2.5 w-2.5 rounded-full bg-night/10" />
            ))}
          </span>
          <p className="flex-1 text-center text-xs text-night/45">
            Interactive demo, nothing here is real
          </p>
          <span aria-hidden="true" className="w-[3.25rem]" />
        </div>

        <div className="grid gap-6 bg-gradient-to-b from-sky-50/70 to-white p-4 sm:p-8 md:grid-cols-[minmax(0,1fr)_15.5rem] md:items-center md:gap-10">
          <section aria-label="Host screen" className={`${SURFACE} p-5 sm:p-6`}>
            <Caption>Host screen</Caption>
            {hostScreen}
          </section>
          <section
            aria-label="Student phone"
            className="mx-auto w-full max-w-[15.5rem] rounded-[1.75rem] bg-night p-1.5 shadow-[0_20px_40px_-24px_rgba(17,16,20,0.6)]"
          >
            <div className="rounded-[1.4rem] bg-white p-4">
              <Caption>Student phone</Caption>
              {phoneScreen}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-night/15 px-4 py-3 sm:px-6">
          <ol aria-label="Demo steps" className="flex flex-wrap items-center gap-1">
            {STEPS.map((entry, index) => (
              <li key={entry.label}>
                <button
                  type="button"
                  aria-current={index === step ? 'step' : undefined}
                  onClick={() => {
                    takeOver();
                    goTo(index);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150 ${
                    index === step
                      ? 'bg-night/[0.06] font-medium text-night'
                      : 'text-night/50 hover:text-night'
                  }`}
                >
                  <span className="mr-1.5 font-geist-mono text-xs opacity-60">{index + 1}</span>
                  {entry.label}
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
            className="rounded-lg px-2.5 py-1.5 text-sm text-night/60 transition-colors duration-150 hover:bg-night/[0.05] hover:text-night"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-xs text-night/40">{children}</p>;
}
