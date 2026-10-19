import { useId, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ServerStatus } from '../components/ServerStatus';
import { Notice, buttonClasses } from '../components/ui';
import { useAuth } from '../lib/AuthContext';

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
    navigate(`/join?code=${encodeURIComponent(code)}`);
  }

  return (
    <div className="space-y-12">
      {notice && <Notice tone="warning">{notice}</Notice>}

      <section className="space-y-4">
        <h1 className="max-w-2xl text-title font-semibold tracking-tight sm:text-hero">
          Live quizzes and exams for your class
        </h1>
        <p className="max-w-prose text-lg text-muted">
          Students join with a code on any device, no account needed. Hosts build questions, run
          them live or as timed exams, and see who needs help while it happens.
        </p>
      </section>

      <form
        onSubmit={handleJoin}
        noValidate
        className="rounded-xl bg-board p-6 text-white sm:p-8"
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

      <section className="grid gap-8 border-t border-rule pt-8 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">For students</h2>
          <p className="text-muted">
            Answer on a phone or laptop. If the page reloads, you pick up where you left off.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">For hosts</h2>
          <p className="text-muted">
            Write questions, import a spreadsheet or review AI drafts, then run a live, adaptive or
            timed exam session.
          </p>
          {canHost ? (
            <Link to="/host" className={buttonClasses('secondary', 'md')}>
              Open your dashboard
            </Link>
          ) : !session ? (
            <Link to="/login" className={buttonClasses('secondary', 'md')}>
              Log in to host
            </Link>
          ) : null}
        </div>
      </section>

      <ServerStatus />
    </div>
  );
}
