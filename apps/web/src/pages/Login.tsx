import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { emailSchema } from '@quizup/shared';
import { AuthField, AuthNotice } from '../components/landing/AuthField';
import { ctaLight, ctaPrimary, ctaSize } from '../components/landing/cta';
import { Frame, RULE } from '../components/landing/frame';
import { useAuth } from '../lib/AuthContext';
import { HOST_ACCESS_CONTACT_EMAIL, HOST_ACCESS_MAILTO } from '../lib/contact';
import { webEnv } from '../lib/env';
import { supabase } from '../lib/supabase';

type Mode = 'sign-in' | 'sign-up';

export function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const parsedInvite = emailSchema.safeParse(searchParams.get('email') ?? '');
  const invitedEmail = parsedInvite.success ? parsedInvite.data : '';
  const invitedHost = searchParams.get('invite') === 'host' && invitedEmail !== '';
  const destination = invitedHost ? '/host' : '/';
  const [mode, setMode] = useState<Mode>(
    searchParams.get('mode') === 'sign-up' ? 'sign-up' : 'sign-in',
  );
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'danger' | 'info'>('danger');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    return <Navigate to={destination} replace />;
  }

  async function handleGoogleSignIn() {
    setMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage(error.message);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setMessageTone('danger');

    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        navigate(destination);
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        setMessage(error.message);
      } else if (!data.session) {
        setMessageTone('info');
        setMessage('Check your email to confirm your account, then sign in.');
      } else {
        navigate(destination);
      }
    }

    setSubmitting(false);
  }

  const signingIn = mode === 'sign-in';

  return (
    <section className="flex flex-1 flex-col">
      <Frame className="flex w-full flex-1 flex-col items-center justify-center pt-32 pb-20 sm:pt-36 sm:pb-24">
        <div className="w-full max-w-sm">
          <h1 className="text-[2rem] leading-[1.1] font-medium tracking-[-0.035em] sm:text-[2.25rem]">
            {signingIn ? 'Sign in' : 'Create an account'}
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-night/55">
            {signingIn ? (
              'Hosts and students with an account sign in here. Joining a quiz never needs an account.'
            ) : invitedHost ? (
              'Choose your name and a password. Host access is already waiting for this email address.'
            ) : (
              <>
                Every new account starts as a student account. To become a host, email{' '}
                <a
                  href={HOST_ACCESS_MAILTO}
                  className="font-medium text-night underline decoration-night/25 underline-offset-4 transition-colors hover:decoration-night"
                >
                  {HOST_ACCESS_CONTACT_EMAIL}
                </a>
                .
              </>
            )}
          </p>

          {invitedHost && (
            <AuthNotice tone="info" className="mt-6">
              {signingIn
                ? 'You have been invited to host on QuizUp. Sign in with this email address to open your dashboard.'
                : 'You have been invited to host on QuizUp. Create your account with this email address, then you will land on your dashboard.'}
            </AuthNotice>
          )}

          <form onSubmit={(event) => void handleSubmit(event)} className="mt-8 space-y-4">
            {!signingIn && (
              <AuthField
                label="Name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
            <AuthField
              label="Email"
              type="email"
              required
              autoComplete="email"
              readOnly={invitedHost}
              hint={invitedHost ? 'Host access is tied to this email address.' : undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <AuthField
              label="Password"
              type="password"
              required
              minLength={6}
              autoComplete={signingIn ? 'current-password' : 'new-password'}
              hint={signingIn ? undefined : 'At least 6 characters.'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {message && <AuthNotice tone={messageTone}>{message}</AuthNotice>}
            <button
              type="submit"
              disabled={submitting}
              className={`${ctaPrimary} ${ctaSize.lg} w-full`}
            >
              {signingIn ? 'Sign in' : 'Sign up'}
            </button>
          </form>

          {webEnv.VITE_GOOGLE_AUTH_ENABLED && (
            <>
              <div
                className="my-5 flex items-center gap-3 text-sm text-night/40"
                aria-hidden="true"
              >
                <span className={`h-px flex-1 border-t ${RULE}`} />
                or
                <span className={`h-px flex-1 border-t ${RULE}`} />
              </div>
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                className={`${ctaLight} ${ctaSize.lg} w-full`}
              >
                <GoogleMark />
                Continue with Google
              </button>
            </>
          )}

          <div className="mt-8 space-y-2 text-sm text-night/55">
            <p>
              <button
                type="button"
                className="font-medium text-night underline decoration-night/25 underline-offset-4 transition-colors hover:decoration-night"
                onClick={() => setMode(signingIn ? 'sign-up' : 'sign-in')}
              >
                {signingIn ? 'Need an account? Sign up' : 'Have an account? Sign in'}
              </button>
            </p>
            <p>
              Just joining a quiz?{' '}
              <Link
                to="/join"
                className="font-medium text-night underline decoration-night/25 underline-offset-4 transition-colors hover:decoration-night"
              >
                Enter a join code
              </Link>
            </p>
          </div>
        </div>
      </Frame>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
