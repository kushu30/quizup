import { createClient } from '@supabase/supabase-js';
import { serverEnv } from './env.js';

export const supabaseAdmin = createClient(
  serverEnv.SUPABASE_URL,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
