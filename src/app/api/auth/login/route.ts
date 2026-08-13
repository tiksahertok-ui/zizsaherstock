import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createSession, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const account = await prisma.account.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!verifyPassword(password, account.password)) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = await createSession(account.id);
    const response = NextResponse.json({
      success: true,
      token,
      account: { id: account.id, email: account.email },
    });
    setSessionCookie(response, token);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Login error:', err);
    return NextResponse.json(
      { error: 'Login failed', detail: message },
      { status: 500 }
    );
  }
}
