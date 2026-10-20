import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { emailSchema } from '@quizup/shared';
import { Button, Notice, PageHeader, Panel, TextField } from '../components/ui';
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
    <div className="mx-auto max-w-md">
      <PageHeader
        title={signingIn ? 'Sign in' : 'Create an account'}
        description={
          signingIn ? (
            'Hosts and students with an account sign in here. Joining a quiz never needs an account.'
          ) : invitedHost ? (
            'Choose your name and a password. Host access is already waiting for this email address.'
          ) : (
            <>
              Every new account starts as a student account. To become a host, email{' '}
              <a
                href={HOST_ACCESS_MAILTO}
                className="font-medium text-board underline underline-offset-4"
              >
                {HOST_ACCESS_CONTACT_EMAIL}
              </a>
              .
            </>
          )
        }
      />
      {invitedHost && (
        <Notice tone="info" className="mb-4">
          {signingIn
            ? 'You have been invited to host on QuizUp. Sign in with this email address to open your dashboard.'
            : 'You have been invited to host on QuizUp. Create your account with this email address, then you will land on your dashboard.'}
        </Notice>
      )}
      <Panel>
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
          {!signingIn && (
            <TextField
              label="Name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
          <TextField
            label="Email"
            type="email"
            required
            autoComplete="email"
            readOnly={invitedHost}
            hint={invitedHost ? 'Host access is tied to this email address.' : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            required
            minLength={6}
            autoComplete={signingIn ? 'current-password' : 'new-password'}
            hint={signingIn ? undefined : 'At least 6 characters.'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {message && <Notice tone={messageTone}>{message}</Notice>}
          <Button type="submit" size="lg" disabled={submitting} className="w-full">
            {signingIn ? 'Sign in' : 'Sign up'}
          </Button>
        </form>
        {webEnv.VITE_GOOGLE_AUTH_ENABLED && (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => void handleGoogleSignIn()}
            className="mt-3 w-full"
          >
            Continue with Google
          </Button>
        )}
      </Panel>
      <p className="mt-6 text-center text-sm text-muted">
        <button
          type="button"
          className="font-medium text-board underline-offset-4 hover:underline"
          onClick={() => setMode(signingIn ? 'sign-up' : 'sign-in')}
        >
          {signingIn ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
      </p>
    </div>
  );
}
