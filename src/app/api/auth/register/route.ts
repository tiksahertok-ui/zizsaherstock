import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, createSession, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const trimmed = username.trim();
    if (trimmed.length < 2) {
      return NextResponse.json(
        { error: 'Username must be at least 2 characters' },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters' },
        { status: 400 }
      );
    }

    const existing = await prisma.account.findUnique({
      where: { username: trimmed.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 409 }
      );
    }

    const hashedPassword = hashPassword(password);
    const account = await prisma.account.create({
      data: {
        username: trimmed.toLowerCase(),
        password: hashedPassword,
      },
    });

    const token = await createSession(account.id);
    const response = NextResponse.json({
      success: true,
      token,
      account: { id: account.id, username: account.username },
    });
    setSessionCookie(response, token);
    return response;
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
