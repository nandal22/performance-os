import { createClient } from '@supabase/supabase-js';
import { cookieAuthStorage } from './cookieAuthStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

// Using untyped client for now — our own types (Activity, Exercise, etc.)
// handle type safety via casting in each service.
// Replace with: createClient<Database>(...) after running:
// npx supabase gen types typescript --project-id YOUR_ID > src/db/database.types.ts
//
// Session storage is a cookie on .sachinnandal.me (not the default
// localStorage) so the same Supabase session is shared with training.,
// cashflow., index. and tools. — see cookieAuthStorage.ts.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieAuthStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
