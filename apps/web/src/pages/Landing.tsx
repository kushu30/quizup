import { useId, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HeroIllustration } from '../components/landing/HeroIllustration';
import { Notice, buttonClasses } from '../components/ui';
import { useAuth } from '../lib/AuthContext';

const MODES = [
  {
    title: 'Live quiz',
    body: 'Everyone answers the same question at the same time. Points reward speed, and the leaderboard moves as answers arrive.',
  },
  {
    title: 'Adaptive quiz',
    body: 'Each student gets questions matched to their level, so strong students are stretched and others are not lost.',
  },
  {
    title: 'Timed exam',
    body: 'Students work alone against a timer. Results stay hidden until you release them.',
  },
];

const STEPS = [
  {
    title: 'Build your questions',
    body: 'Write them, import a spreadsheet, or review AI drafts before anything reaches students.',
  },
  {
    title: 'Share the code',
    body: 'Show the six-letter code or QR code, or send the link to your class group.',
  },
  {
    title: 'Run it and follow up',
    body: 'Watch answers come in, see who needs help, then open the summary, history and exports.',
  },
];

const FEATURES = [
  {
    title: 'Your institution on every screen',
    body: 'Add your logo and colour. Students see your brand from the join link to the feedback form, with QuizUp quietly behind it.',
  },
  {
    title: 'Invited students only',
    body: 'Give each student a personal token so nobody can join under someone else’s name.',
  },
  {
    title: 'Proctoring when you want it',
    body: 'Choose before you start whether to record tab switches and similar signals. Students are told first.',
  },
  {
    title: 'Nobody loses their place',
    body: 'If the connection drops, the timer keeps running and answers are sent once the student is back.',
  },
  {
    title: 'Anonymous feedback',
    body: 'Students rate the session and leave a comment without their name attached.',
  },
  {
    title: 'History and exports',
    body: 'Every session is kept with scores, response times and the device each student used. Download it as CSV.',
  },
];

export function Landing() {
  const { canHost, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [joinCode, setJoinCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setCodeError('Enter the code your host shows on screen.');
      return;
    }
    navigate(`/join/${encodeURIComponent(code)}`);
  }

  const hostLink = canHost ? (
    <Link to="/host" className={buttonClasses('secondary', 'lg')}>
      Open your dashboard
    </Link>
  ) : !session ? (
    <Link to="/login" className={buttonClasses('secondary', 'lg')}>
      Log in to host
    </Link>
  ) : null;

  return (
    <div>
      {notice && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <Notice tone="warning">{notice}</Notice>
        </div>
      )}

      <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:py-24">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="max-w-xl text-hero font-bold tracking-tight text-balance sm:text-[3.25rem] sm:leading-[1.1]">
              Live quizzes and timed exams for your class
            </h1>
            <p className="max-w-lg text-lg text-muted">
              Students join with a six-letter code on any phone or laptop, no account needed. You
              build the questions, run the session and see who needs help while it happens.
            </p>
          </div>

          <form
            onSubmit={handleJoin}
            noValidate
            className="max-w-lg rounded-xl bg-board p-6 text-white"
            aria-label="Join a quiz"
          >
            <label htmlFor={inputId} className="block text-lg font-semibold">
              Join code
            </label>
            <p id={hintId} className="mt-1 text-sm text-white/80">
              Six letters and numbers, shown on your host&apos;s screen.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                id={inputId}
                value={joinCode}
                onChange={(event) => {
                  setJoinCode(event.target.value);
                  setCodeError(null);
                }}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? `${hintId} ${errorId}` : hintId}
                placeholder="K7M2QX"
                className="min-w-0 flex-1 rounded-md border-2 border-transparent bg-white px-4 py-3 text-center text-title font-semibold tracking-[0.3em] text-ink uppercase tabular-nums placeholder:text-ink/25 focus:border-marker focus-visible:outline-white sm:text-left"
              />
              <button
                type="submit"
                className={`${buttonClasses('accent', 'lg')} focus-visible:outline-white`}
              >
                Continue
              </button>
            </div>
            {codeError && (
              <p id={errorId} className="mt-3 text-sm font-medium text-marker-soft">
                {codeError}
              </p>
            )}
          </form>
          {hostLink && (
            <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
              Running the session yourself? {hostLink}
            </p>
          )}
        </div>

        <HeroIllustration />
      </section>

      <section aria-labelledby="modes-heading" className="border-y border-rule bg-surface">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-14 sm:py-20">
          <div className="max-w-2xl space-y-3">
            <h2 id="modes-heading" className="text-title font-semibold tracking-tight sm:text-hero">
              Three ways to run an assessment
            </h2>
            <p className="text-lg text-muted">
              Pick the one that fits the moment. Switching later is one setting.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-rule bg-rule md:grid-cols-3">
            {MODES.map((mode) => (
              <div key={mode.title} className="space-y-2 bg-paper p-6 sm:p-8">
                <h3 className="text-xl font-semibold">{mode.title}</h3>
                <p className="text-muted">{mode.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <h2 id="how-heading" className="text-title font-semibold tracking-tight sm:text-hero">
          From idea to results in three steps
        </h2>
        <ol aria-label="How it works" className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marker text-lg font-bold text-ink"
              >
                {index + 1}
              </span>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features-heading" className="border-t border-rule bg-surface">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-14 sm:py-20">
          <h2
            id="features-heading"
            className="max-w-2xl text-title font-semibold tracking-tight sm:text-hero"
          >
            Made for real classrooms
          </h2>
          <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="space-y-2 border-t-2 border-board pt-4">
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="text-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="cta-heading" className="bg-board text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:py-16 md:flex-row md:items-center">
          <div className="max-w-xl space-y-2">
            <h2 id="cta-heading" className="text-title font-semibold tracking-tight sm:text-hero">
              Ready for your next class?
            </h2>
            <p className="text-lg text-white/85">
              Students need only a code. You need only a few minutes to set it up.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/join"
              className={`${buttonClasses('accent', 'lg')} focus-visible:outline-white`}
            >
              Join a quiz
            </Link>
            {hostLink}
          </div>
        </div>
      </section>
    </div>
  );
}
