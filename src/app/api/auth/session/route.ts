import { NextResponse } from 'next/server';
import { getCurrentSession, cleanupExpiredSessions } from '@/lib/auth';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Probabilistic cleanup (~1% of requests)
    if (Math.random() < 0.01) {
      cleanupExpiredSessions().catch(() => {});
    }

    const session = await getCurrentSession(request);

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // No token in response — cookie is the only transport
    return NextResponse.json({
      authenticated: true,
      account: {
        id: session.account.id,
        email: session.account.email,
      },
    });
  } catch (err) {
    console.error('Session check error:', err);
    return NextResponse.json(
      { error: 'Session check failed' },
      { status: 500 },
    );
  }
}
