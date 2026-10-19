import { emailSchema, hostAllowlistSchema, type HostAllowlistEntry } from '@quizup/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RequireRole } from '../components/RequireRole';
import { supabase } from '../lib/supabase';

function HostAllowlistManager() {
  const [entries, setEntries] = useState<HostAllowlistEntry[]>([]);
  const [newEmail, setNewEmail] = useState('');
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
      setMessage('Enter a valid email address');
      return;
    }
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Host allowlist</h1>
      <form onSubmit={(event) => void handleAdd(event)} className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2"
          placeholder="host@example.com"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
        />
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-white">
          Add
        </button>
      </form>
      {message && <p className="text-sm text-red-700">{message}</p>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {entries.map((entry) => (
          <li key={entry.email} className="flex items-center justify-between px-4 py-2">
            <span>{entry.email}</span>
            <button
              type="button"
              className="text-sm text-red-700 hover:underline"
              onClick={() => void handleRemove(entry.email)}
            >
              Remove
            </button>
          </li>
        ))}
        {entries.length === 0 && <li className="px-4 py-2 text-slate-500">No hosts yet</li>}
      </ul>
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
