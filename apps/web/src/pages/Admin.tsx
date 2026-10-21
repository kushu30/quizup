import { emailSchema, hostAllowlistSchema, type HostAllowlistEntry } from '@quizup/shared';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { AuthNotice } from '../components/landing/AuthField';
import { ctaPrimary, ctaQuiet, ctaQuietDanger, ctaSize } from '../components/landing/cta';
import { PageBody, PageHeader } from '../components/app/Page';
import { AppIcon, ICONS } from '../components/app/icons';
import { RequireRole } from '../components/RequireRole';
import { api, describeError } from '../lib/api';
import { useAutoDismiss } from '../lib/useAutoDismiss';
import { supabase } from '../lib/supabase';

function HostAllowlistManager() {
  const [entries, setEntries] = useState<HostAllowlistEntry[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mailNotice, setMailNotice] = useState<{ tone: 'info' | 'warning'; text: string } | null>(
    null,
  );
  const messageFading = useAutoDismiss(message, () => setMessage(null));
  const mailFading = useAutoDismiss(mailNotice, () => setMailNotice(null), 6000);
  const emailId = useId();
  const emailErrorId = `${emailId}-error`;

  const loadEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('host_allowlist')
      .select('*')
      .order('created_at', { ascending: true });
    const parsed = hostAllowlistSchema.safeParse(data);
    if (error || !parsed.success) {
      setMessage(error?.message ?? 'Could not read the allowlist');
      return;
    }
    setEntries(parsed.data);
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const parsedEmail = emailSchema.safeParse(newEmail);
    if (!parsedEmail.success) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailError(null);
    const { error } = await supabase.from('host_allowlist').insert({ email: parsedEmail.data });
    if (error) {
      setMessage(error.message);
      return;
    }
    setNewEmail('');
    setMessage(null);
    await loadEntries();
    await sendHostEmail(parsedEmail.data, true);
  }

  async function sendHostEmail(email: string, justAdded: boolean) {
    setMailNotice(null);
    try {
      await api.notifyHostAccess(email);
      setMailNotice({ tone: 'info', text: `We emailed ${email} to let them know.` });
    } catch (error) {
      setMailNotice({
        tone: 'warning',
        text: `${justAdded ? `${email} was added, but the` : 'The'} email was not sent: ${describeError(error)}`,
      });
    }
  }

  async function handleRemove(email: string) {
    const { error } = await supabase.from('host_allowlist').delete().eq('email', email);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(null);
    await loadEntries();
  }

  return (
    <section className="flex flex-1 flex-col">
      <PageHeader
        title="Host access"
        description="These people become hosts when they sign in. Everyone else gets a student account."
        actions={
          <form onSubmit={(event) => void handleAdd(event)} noValidate className="w-full lg:w-auto">
            <div className="flex items-center gap-2">
              <label htmlFor={emailId} className="sr-only">
                Host email
              </label>
              <input
                id={emailId}
                type="email"
                autoComplete="off"
                placeholder="host@example.com"
                value={newEmail}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? emailErrorId : undefined}
                onChange={(event) => setNewEmail(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-[0.8rem] bg-white px-4 text-[0.9375rem] text-night shadow-[0_0_0_1px_rgba(17,16,20,0.12)] transition-shadow duration-200 ease-soft placeholder:text-night/40 hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none aria-[invalid=true]:shadow-[0_0_0_2px_var(--color-alert)] lg:w-72 lg:flex-none"
              />
              <button type="submit" className={`${ctaPrimary} ${ctaSize.md}`}>
                Add host
              </button>
            </div>
            {emailError && (
              <p id={emailErrorId} className="mt-2 text-sm font-medium text-alert">
                {emailError}
              </p>
            )}
          </form>
        }
      >
        {(message || mailNotice) && (
          <div className="mt-8 space-y-3">
            {message && (
              <AuthNotice tone="danger" fading={messageFading} onDismiss={() => setMessage(null)}>
                {message}
              </AuthNotice>
            )}
            {mailNotice && (
              <AuthNotice
                tone={mailNotice.tone}
                fading={mailFading}
                onDismiss={() => setMailNotice(null)}
              >
                {mailNotice.text}
              </AuthNotice>
            )}
          </div>
        )}
      </PageHeader>
      <PageBody>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-5 px-4 py-20 text-center sm:px-10">
            <AppIcon size={28} className="text-night/30">
              {ICONS.people}
            </AppIcon>
            <p className="max-w-sm leading-relaxed text-night/55">
              No hosts yet. Add an email address above.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-dashed divide-night/15">
            {entries.map((entry) => (
              <li
                key={entry.email}
                className="flex flex-col gap-4 px-4 py-5 transition-colors duration-300 ease-soft hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:px-10"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-night/[0.05] text-[0.9375rem] font-medium text-night/60 uppercase"
                  >
                    {entry.email.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium break-all">{entry.email}</p>
                    <p className="mt-0.5 text-sm text-night/50">
                      Added{' '}
                      {new Date(entry.created_at).toLocaleDateString(undefined, {
                        dateStyle: 'medium',
                      })}
                    </p>
                  </div>
                </div>
                <div className="ml-[2.625rem] flex shrink-0 items-center gap-1.5 sm:ml-0">
                  <button
                    type="button"
                    aria-label={`Email ${entry.email} again`}
                    onClick={() => void sendHostEmail(entry.email, false)}
                    className={`${ctaQuiet} ${ctaSize.sm}`}
                  >
                    Email again
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.email}`}
                    onClick={() => void handleRemove(entry.email)}
                    className={`${ctaQuietDanger} ${ctaSize.sm}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </section>
  );
}

export function Admin() {
  return (
    <RequireRole roles={['admin']} deniedNotice="Admin access required.">
      <HostAllowlistManager />
    </RequireRole>
  );
}
