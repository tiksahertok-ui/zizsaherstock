import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * POST /api/auth/lookup-username
 *
 * Looks up the email associated with a username.
 * Used when a user signs in with their username instead of email.
 *
 * Body: { username: string }
 * Returns: { email: string } or { error: string }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 });
    }

    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
        { status: 400 }
      );
    }

    // Look up email from profiles table
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', trimmedUsername)
      .maybeSingle();

    // If table doesn't exist (setup phase), return error gracefully
    if (error && (error.code === 'PGRST205' || error.code === '42P01' || error.message?.toLowerCase().includes('does not exist'))) {
      return NextResponse.json(
        { error: 'Username not found' },
        { status: 404 }
      );
    }

    if (error) {
      console.error('Error looking up username:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    if (!data || !data.email) {
      return NextResponse.json(
        { error: 'Username not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ email: data.email });
  } catch (error) {
    console.error('Error in lookup-username:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
