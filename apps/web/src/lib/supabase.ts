import { createClient } from '@supabase/supabase-js';
import { webEnv } from './env';

export const supabase = createClient(webEnv.VITE_SUPABASE_URL, webEnv.VITE_SUPABASE_ANON_KEY);
