import { useEffect, useState, type ReactNode } from 'react';
import { useServerPulse } from '../../lib/useServerPulse';

const CODE = 'K7M2QX';
const QUESTION = 'which isolation level prevents dirty reads but allows non-repeatable reads?';
const ANSWER_SECONDS = 15;
const STEP_MS = [3000, 2400, 7000, 3200, 4500];
const STEPS = [
  { label: 'Share the code', host: 'Host shares the join code', student: 'Student opens the link' },
  { label: 'Students join', host: 'Students join the lobby', student: 'Student is in' },
  { label: 'Answer', host: 'Answers come in live', student: 'Student answers' },
  { label: 'Results', host: 'Host sees how the class did', student: 'Student sees the result' },
  { label: 'Leaderboard', host: 'Leaderboard and exports', student: 'Final standing' },
];

const OPTIONS = [
  { letter: 'A', text: 'Read committed', tone: 'bg-answer-a text-white', correct: true, votes: 2 },
  {
    letter: 'B',
    text: 'Read uncommitted',
    tone: 'bg-answer-b text-white',
    correct: false,
    votes: 0,
  },
  { letter: 'C', text: 'Serializable', tone: 'bg-answer-c text-ink', correct: false, votes: 1 },
  {
    letter: 'D',
    text: 'Repeatable read',
    tone: 'bg-answer-d text-white',
    correct: false,
    votes: 1,
  },
];

const OTHERS = [
  { name: 'Ben', score: 4310 },
  { name: 'Chen', score: 3975 },
  { name: 'Dana', score: 3540 },
];

function clockText(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function GrowBar({ percent, tone }: { percent: number; tone: string }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGrown(true), 40);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-paper">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${tone}`}
        style={{ width: grown ? `${percent}%` : '0%' }}
      />
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in min-h-[19rem] space-y-4">{children}</div>;
}

interface LiveDemoProps {
  name: string | null;
}

export function LiveDemo({ name }: LiveDemoProps) {
  const pulse = useServerPulse();
  const now = useNow(250);
  const [role, setRole] = useState<'student' | 'host'>('student');
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [playing, setPlaying] = useState(
    () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  const firstName = name?.trim().split(/\s+/)[0] || null;
  const you = firstName ?? 'You';
  const question = firstName
    ? `${firstName}, ${QUESTION}`
    : `${QUESTION.charAt(0).toUpperCase()}${QUESTION.slice(1)}`;
  const correct = picked === null ? true : (OPTIONS[picked]?.correct ?? false);

  function goTo(next: number) {
    setStep(next);
    setPicked(null);
    setStartedAt(Date.now());
  }

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setTimeout(() => {
      if (step === 2) {
        setPicked(0);
        setStep(3);
        setStartedAt(Date.now());
      } else {
        goTo((step + 1) % STEPS.length);
      }
    }, STEP_MS[step]);
    return () => clearTimeout(timer);
  }, [step, playing]);

  const secondsLeft = Math.max(ANSWER_SECONDS - Math.floor((now - startedAt) / 1000), 0);
  const answeredCount = Math.min(1 + Math.floor((now - startedAt) / 1800), 4);
  const standings = [
    { name: you, score: correct ? 4640 : 3120, you: true },
    ...OTHERS.map((o) => ({ ...o, you: false })),
  ]
    .concat([{ name: 'Asha', score: 4820, you: false }])
    .sort((first, second) => second.score - first.score);

  const studentPanel = (
    <Panel>
      {step === 0 && (
        <div className="space-y-3 rounded-xl bg-board p-5 text-white">
          <p className="text-lg font-semibold">Join a quiz</p>
          <p className="rounded-md bg-white px-4 py-3 text-center text-2xl font-semibold tracking-[0.3em] text-ink">
            {CODE}
          </p>
          <p className="text-sm text-white/85">
            Scan the QR code or type the code your host shows.
          </p>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3 py-8 text-center">
          <p className="text-title font-semibold">
            {you === 'You' ? 'You are in' : `${you}, you are in`}
          </p>
          <p className="text-muted">Waiting for the host to start the quiz</p>
          <p aria-hidden="true" className="flex justify-center gap-1.5">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="animate-tile h-2.5 w-2.5 rounded-full bg-board"
                style={{ animationDelay: `${dot * 200}ms` }}
              />
            ))}
          </p>
        </div>
      )}
      {step === 2 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-lg bg-board px-3 py-1.5 text-2xl leading-none font-bold text-white tabular-nums">
              0:{String(secondsLeft).padStart(2, '0')}
            </span>
            <span className="text-sm font-medium text-muted">Tap an answer</span>
          </div>
          <p className="text-lg leading-snug font-semibold text-ink">{question}</p>
          <ul className="grid gap-2">
            {OPTIONS.map((option, index) => (
              <li key={option.letter}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(index);
                    setStep(3);
                    setStartedAt(Date.now());
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border-2 border-rule bg-surface px-3 py-2.5 text-left text-sm transition hover:border-board hover:bg-board-soft"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${option.tone}`}
                  >
                    {option.letter}
                  </span>
                  {option.text}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {step === 3 && (
        <div
          role="status"
          aria-label="Answer result"
          className={`animate-pop space-y-1 rounded-xl p-6 text-center text-white ${
            correct ? 'bg-success' : 'bg-alert'
          }`}
        >
          <p className="text-title font-semibold">{correct ? 'Correct' : 'Not quite'}</p>
          <p className="text-xl tabular-nums">{correct ? '+820 points' : '+0 points'}</p>
          <p className="text-sm text-white/85">The answer was A, Read committed.</p>
        </div>
      )}
      {step === 4 && (
        <>
          <p className="text-lg font-semibold">
            You finished #{standings.findIndex((entry) => entry.you) + 1}
          </p>
          <Standings standings={standings} />
          <p className="text-sm text-muted">Then a short anonymous feedback form.</p>
        </>
      )}
    </Panel>
  );

  const hostPanel = (
    <Panel>
      {step === 0 && (
        <div className="space-y-3 rounded-xl bg-board p-5 text-center text-white">
          <p className="text-sm text-white/85">Join code</p>
          <p className="text-display leading-none font-bold tracking-[0.18em]">{CODE}</p>
          <p className="text-sm text-white/85">Also as a QR code and a link to copy</p>
        </div>
      )}
      {step === 1 && (
        <>
          <p className="font-semibold">
            Students <span className="font-normal text-muted">4 joined</span>
          </p>
          <ul className="flex flex-wrap gap-2">
            {[you, 'Ben', 'Chen', 'Dana'].map((student, index) => (
              <li
                key={student}
                className="animate-pop rounded-md bg-board-soft px-3 py-1.5 text-sm text-board"
                style={{ animationDelay: `${index * 250}ms` }}
              >
                {student}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Proctoring and devices are your choice when you start.
          </p>
        </>
      )}
      {step === 2 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-lg bg-board px-3 py-1.5 text-2xl leading-none font-bold text-white tabular-nums">
              0:{String(secondsLeft).padStart(2, '0')}
            </span>
            <span className="text-sm font-medium tabular-nums">{answeredCount} of 4 answered</span>
          </div>
          <GrowBar percent={answeredCount * 25} tone="bg-board" />
          <p className="font-semibold text-ink">{question}</p>
        </>
      )}
      {step === 3 && (
        <ul className="space-y-3">
          {OPTIONS.map((option) => (
            <li key={option.letter} className="space-y-1">
              <p className="flex items-center justify-between text-sm">
                <span className={option.correct ? 'font-semibold text-success' : ''}>
                  {option.letter}. {option.text}
                  {option.correct && ' (correct)'}
                </span>
                <span className="tabular-nums text-muted">{option.votes}</span>
              </p>
              <GrowBar
                percent={option.votes * 25}
                tone={option.correct ? 'bg-success' : 'bg-rule-strong'}
              />
            </li>
          ))}
        </ul>
      )}
      {step === 4 && (
        <>
          <p className="font-semibold">Final leaderboard</p>
          <Standings standings={standings} />
          <p className="text-sm text-muted">Summary, history and CSV exports are saved for you.</p>
        </>
      )}
    </Panel>
  );

  return (
    <figure className="mx-auto w-full max-w-lg space-y-3">
      <div className="rounded-2xl border border-rule bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Choose a view"
            className="inline-flex rounded-lg bg-paper p-1"
          >
            {(['student', 'host'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={role === value}
                onClick={() => setRole(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  role === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {value === 'student' ? 'Student view' : 'Host view'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span aria-label="Local time" className="tabular-nums">
              {clockText(new Date(now))}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  pulse.state === 'online'
                    ? 'bg-success'
                    : pulse.state === 'offline'
                      ? 'bg-alert'
                      : 'animate-tile bg-marker'
                }`}
              />
              {pulse.state === 'online'
                ? `Server online, ${pulse.latencyMs} ms`
                : pulse.state === 'offline'
                  ? 'Server unreachable'
                  : 'Checking the server'}
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm font-semibold text-muted">
          Step {step + 1} of {STEPS.length}: {STEPS[step]?.[role]}
        </p>
        <div
          role="tabpanel"
          aria-label={role === 'student' ? 'Student view' : 'Host view'}
          className="mt-3"
        >
          {role === 'student' ? studentPanel : hostPanel}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-rule pt-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((entry, index) => (
              <button
                key={entry.label}
                type="button"
                aria-label={`Step ${index + 1}: ${entry.label}`}
                aria-current={index === step ? 'step' : undefined}
                onClick={() => goTo(index)}
                className={`h-8 w-8 rounded-full text-sm font-semibold tabular-nums transition ${
                  index === step ? 'bg-board text-white' : 'bg-paper text-muted hover:text-ink'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-board hover:bg-board-soft"
          >
            {playing ? 'Pause demo' : 'Play demo'}
          </button>
        </div>
      </div>
      <figcaption className="text-center text-xs text-muted">
        Simulated walkthrough. The clock and the server status are live.
      </figcaption>
    </figure>
  );
}

function Standings({ standings }: { standings: { name: string; score: number; you: boolean }[] }) {
  return (
    <ol className="space-y-1.5">
      {standings.map((entry, index) => (
        <li
          key={entry.name}
          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
            entry.you ? 'border-board bg-board-soft font-semibold' : 'border-rule'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-marker text-[11px] font-bold text-ink">
              {index + 1}
            </span>
            {entry.name}
          </span>
          <span className="tabular-nums text-muted">{entry.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
