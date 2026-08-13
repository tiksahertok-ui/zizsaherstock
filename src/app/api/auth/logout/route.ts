import { NextResponse } from 'next/server';
import { deleteSessionByToken, clearSessionCookie, getCurrentSession } from '@/lib/auth';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession(request);
    if (session) {
      await deleteSessionByToken(session.token);
    }
    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  } catch (err) {
    console.error('Logout error:', err);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}
