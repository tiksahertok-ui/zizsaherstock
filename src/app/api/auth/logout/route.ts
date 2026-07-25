import { NextResponse } from 'next/server';
import { deleteSessionFromDb, clearSessionCookie } from '@/lib/auth';

export async function POST() {
  try {
    await deleteSessionFromDb();
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
