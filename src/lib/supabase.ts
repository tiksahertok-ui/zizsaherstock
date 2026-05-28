/**
 * Supabase Client — Server-side singleton
 *
 * Used by all API routes for database operations.
 * The publishable key gives access to the REST API (CRUD on public tables).
 *
 * When env vars are missing, exports `null` so routes can gracefully degrade.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const isConfigured = supabaseUrl.length > 0 && supabaseKey.length > 0;

// Singleton pattern for server-side
const globalForSupabase = globalThis as unknown as {
  supabase: SupabaseClient | null;
};

if (isConfigured && !globalForSupabase.supabase) {
  globalForSupabase.supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const supabase: SupabaseClient | null = globalForSupabase.supabase ?? null;
export const isSupabaseConfigured = isConfigured;
export default supabase;
