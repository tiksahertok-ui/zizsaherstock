import { NextResponse } from 'next/server';
import { getCurrentSession, cleanupExpiredSessions } from '@/lib/auth';

export async function GET() {
  try {
    // Periodic cleanup (runs on ~1% of session checks)
    if (Math.random() < 0.01) {
      cleanupExpiredSessions().catch(() => {});
    }

    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      account: {
        id: session.account.id,
        username: session.account.username,
      },
    });
  } catch (err) {
    console.error('Session check error:', err);
    return NextResponse.json(
      { error: 'Session check failed' },
      { status: 500 }
    );
  }
}