import { emailSchema, hostAllowlistSchema, type HostAllowlistEntry } from '@quizup/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RequireRole } from '../components/RequireRole';
import { Button, Notice, PageHeader, TextField } from '../components/ui';
import { api, describeError } from '../lib/api';
import { supabase } from '../lib/supabase';

function HostAllowlistManager() {
  const [entries, setEntries] = useState<HostAllowlistEntry[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mailNotice, setMailNotice] = useState<{ tone: 'info' | 'warning'; text: string } | null>(
    null,
  );

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
    <div className="max-w-2xl">
      <PageHeader
        title="Host allowlist"
        description="People with these email addresses become hosts when they sign in. Everyone else gets a student account."
      />
      <form
        onSubmit={(event) => void handleAdd(event)}
        noValidate
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <TextField
          label="Host email"
          type="email"
          autoComplete="off"
          className="flex-1"
          placeholder="host@example.com"
          value={newEmail}
          error={emailError}
          onChange={(event) => setNewEmail(event.target.value)}
        />
        <Button type="submit" className="sm:mt-6">
          Add host
        </Button>
      </form>
      {message && (
        <Notice tone="danger" className="mb-6">
          {message}
        </Notice>
      )}
      {mailNotice && (
        <Notice tone={mailNotice.tone} className="mb-6">
          {mailNotice.text}
        </Notice>
      )}
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-rule-strong px-5 py-8 text-center text-muted">
          No hosts yet. Add an email address above.
        </p>
      ) : (
        <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface">
          {entries.map((entry) => (
            <li key={entry.email} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="min-w-0 break-all">{entry.email}</span>
              <span className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Email ${entry.email} again`}
                  onClick={() => void sendHostEmail(entry.email, false)}
                >
                  Email again
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Remove ${entry.email}`}
                  onClick={() => void handleRemove(entry.email)}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Admin() {
  return (
    <RequireRole roles={['admin']} deniedNotice="Admin access required.">
      <HostAllowlistManager />
    </RequireRole>
  );
}
