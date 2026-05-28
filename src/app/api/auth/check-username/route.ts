import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * POST /api/auth/check-username
 *
 * Checks if a username is available (not already taken).
 *
 * Body: { username: string }
 * Returns: { available: boolean, error?: string }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json({ available: true }); // Allow during setup
    }

    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { available: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername.length < 3) {
      return NextResponse.json(
        { available: false, error: 'Username must be at least 3 characters' },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return NextResponse.json(
        { available: false, error: 'Username can only contain letters, numbers, and underscores' },
        { status: 400 }
      );
    }

    // Check if username already exists in profiles table
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', trimmedUsername)
      .maybeSingle();

    // If table doesn't exist (setup phase), allow the username
    if (error && (error.code === 'PGRST205' || error.code === '42P01' || error.message?.toLowerCase().includes('does not exist'))) {
      return NextResponse.json({ available: true });
    }

    if (error) {
      console.error('Error checking username:', error);
      return NextResponse.json(
        { available: false, error: 'Internal server error' },
        { status: 500 }
      );
    }

    if (data) {
      return NextResponse.json({
        available: false,
        error: 'This username is already taken',
      });
    }

    return NextResponse.json({ available: true });
  } catch (error) {
    console.error('Error in check-username:', error);
    return NextResponse.json(
      { available: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
