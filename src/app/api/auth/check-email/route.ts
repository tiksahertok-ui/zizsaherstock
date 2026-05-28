import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * POST /api/auth/check-email
 *
 * Checks if an email address is in the trusted emails list.
 * The list supports exact email matches and domain-level wildcards.
 *
 * Body: { email: string }
 * Returns: { allowed: boolean, error?: string }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json({ allowed: true }); // Allow during setup
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { allowed: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      return NextResponse.json(
        { allowed: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Extract domain from email
    const domain = '@' + trimmedEmail.split('@').pop();

    // Check trusted_emails table
    // If the table doesn't exist yet (PGRST205, 42P01), allow all emails during initial setup
    const { data: exactMatch, error: err1 } = await supabase
      .from('trusted_email')
      .select('id')
      .eq('email', trimmedEmail)
      .maybeSingle();

    // Table doesn't exist — allow during setup phase
    if (err1 && (err1.code === 'PGRST205' || err1.code === '42P01' || err1.message?.toLowerCase().includes('does not exist') || err1.message?.toLowerCase().includes('could not find'))) {
      return NextResponse.json({ allowed: true });
    }

    if (exactMatch) {
      return NextResponse.json({ allowed: true });
    }

    // Check domain match
    const { data: domainMatch, error: err2 } = await supabase
      .from('trusted_email')
      .select('id')
      .eq('email', domain)
      .maybeSingle();

    if (err2) {
      console.error('Error checking trusted email (domain):', err2);
    }

    if (domainMatch) {
      return NextResponse.json({ allowed: true });
    }

    return NextResponse.json({
      allowed: false,
      error: 'This email is not authorized. Please contact the administrator to get access.',
    });
  } catch (error) {
    console.error('Error in check-email:', error);
    return NextResponse.json(
      { allowed: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
