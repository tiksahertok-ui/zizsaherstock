/**
 * Supabase Browser Client — Client-side
 *
 * Used for authentication (sign in, sign out, OTP) and
 * accessing the current user session from client components.
 *
 * When env vars are missing, exports `null` so components can gracefully degrade.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const isConfigured = supabaseUrl.length > 0 && supabaseKey.length > 0;

export let supabaseBrowser: SupabaseClient | null = null;

if (isConfigured) {
  supabaseBrowser = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'egx-portfolio-auth',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  });
}

export const isSupabaseBrowserConfigured = isConfigured;
export default supabaseBrowser;
