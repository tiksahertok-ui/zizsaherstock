import { NextResponse } from 'next/server';
import { getCurrentSession, cleanupExpiredSessions } from '@/lib/auth';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    if (Math.random() < 0.01) {
      cleanupExpiredSessions().catch(() => {});
    }

    const session = await getCurrentSession(request);

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      token: session.token,
      account: {
        id: session.account.id,
        email: session.account.email,
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
