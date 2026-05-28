/**
 * Supabase Browser Client — Client-side
 *
 * Used for authentication (sign in, sign out, OTP) and
 * accessing the current user session from client components.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env'
  );
}

export const supabaseBrowser = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'egx-portfolio-auth',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export default supabaseBrowser;
