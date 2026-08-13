import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'egx-session';
const SESSION_MAX_AGE_DAYS = 30;

// ── Password hashing (PBKDF2) ──────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 600_000, 64, 'sha512')
    .toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHash] = parts;
  if (!salt || !expectedHash) return false;

  try {
    const candidate = crypto
      .pbkdf2Sync(password, salt, 600_000, 64, 'sha512')
      .toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(candidate, 'hex'),
    );
  } catch {
    return false;
  }
}

// ── Session CRUD ──────────────────────────────────────────

export async function createSession(accountId: string): Promise<string> {
  // Delete old sessions for this account (single-device)
  await prisma.session.deleteMany({ where: { accountId } });

  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);

  await prisma.session.create({
    data: { token, accountId, expiresAt },
  });

  return token;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

// ── Get current session from HttpOnly cookie ONLY ─────────

export async function getCurrentSession(request?: NextRequest) {
  let token: string | null = null;

  // Read from cookie only
  try {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  } catch {
    // Fallback: read from request headers manually (for edge cases)
    if (request) {
      const cookieHeader = request.headers.get('cookie') ?? '';
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
      token = match?.[1] ?? null;
    }
  }

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { account: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session;
}

// ── Cookie helpers (HttpOnly + Secure + SameSite=Lax) ────

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

// ── Cleanup expired sessions (called probabilistically) ──

export async function cleanupExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
