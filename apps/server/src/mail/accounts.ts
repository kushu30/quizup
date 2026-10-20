import { supabaseAdmin } from '../supabaseAdmin.js';

export interface AccountDirectory {
  existing: (emails: string[]) => Promise<Set<string>>;
}

const CHUNK = 100;

export const supabaseAccounts: AccountDirectory = {
  async existing(emails) {
    const lowered = [...new Set(emails.map((email) => email.trim().toLowerCase()))];
    const found = new Set<string>();
    for (let start = 0; start < lowered.length; start += CHUNK) {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .in('email', lowered.slice(start, start + CHUNK));
      if (error) {
        throw new Error(error.message);
      }
      for (const row of data ?? []) {
        if (typeof row.email === 'string') {
          found.add(row.email.toLowerCase());
        }
      }
    }
    return found;
  },
};

export async function knownAccounts(
  directory: AccountDirectory,
  emails: string[],
): Promise<Set<string>> {
  try {
    return await directory.existing(emails);
  } catch (error) {
    console.error('Looking up accounts failed', error instanceof Error ? error.message : 'unknown');
    return new Set();
  }
}
