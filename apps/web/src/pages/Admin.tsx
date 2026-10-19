import { emailSchema, hostAllowlistSchema, type HostAllowlistEntry } from '@quizup/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RequireRole } from '../components/RequireRole';
import { Button, Notice, PageHeader, TextField } from '../components/ui';
import { supabase } from '../lib/supabase';

function HostAllowlistManager() {
  const [entries, setEntries] = useState<HostAllowlistEntry[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-rule-strong px-5 py-8 text-center text-muted">
          No hosts yet. Add an email address above.
        </p>
      ) : (
        <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface">
          {entries.map((entry) => (
            <li key={entry.email} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="min-w-0 break-all">{entry.email}</span>
              <Button
                variant="danger"
                size="sm"
                aria-label={`Remove ${entry.email}`}
                onClick={() => void handleRemove(entry.email)}
              >
                Remove
              </Button>
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
