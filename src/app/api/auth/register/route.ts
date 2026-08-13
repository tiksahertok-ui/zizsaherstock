import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      );
    }

    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      );
    }

    const existing = await prisma.account.findUnique({
      where: { email: trimmed },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 },
      );
    }

    const hashedPassword = hashPassword(password);
    const account = await prisma.account.create({
      data: { email: trimmed, password: hashedPassword },
    });

    // Create session
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.session.create({
      data: { token, accountId: account.id, expiresAt },
    });

    const response = NextResponse.json({
      success: true,
      account: { id: account.id, email: account.email },
    });
    setSessionCookie(response, token);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Register error:', err);
    return NextResponse.json(
      { error: 'Registration failed', detail: message },
      { status: 500 },
    );
  }
}
