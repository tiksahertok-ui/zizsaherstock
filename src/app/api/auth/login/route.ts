import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!account || !verifyPassword(password, account.password)) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    // Delete old sessions & create new one
    await prisma.session.deleteMany({ where: { accountId: account.id } });
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
    console.error('Login error:', err);
    return NextResponse.json(
      { error: 'Login failed', detail: message },
      { status: 500 },
    );
  }
}
