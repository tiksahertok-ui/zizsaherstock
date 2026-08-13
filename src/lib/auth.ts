import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'egx-session';
const AUTH_HEADER = 'authorization';
const AUTH_PREFIX = 'Bearer ';
const SESSION_MAX_AGE_DAYS = 90;

// ── Password hashing ──────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const verify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verify));
}

// ── Token generation ──────────────────────────────────────────

export function generateToken(): string {
  return crypto.randomUUID();
}

// ── Session CRUD ──────────────────────────────────────────────

export async function createSession(accountId: string): Promise<string> {
  const token = generateToken();
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

// ── Extract token from request (cookie OR Authorization header) ─

function extractToken(request?: NextRequest): string | null {
  // 1. Try Authorization header first (most reliable through proxies)
  const authHeader = request?.headers.get(AUTH_HEADER);
  if (authHeader?.startsWith(AUTH_PREFIX)) {
    return authHeader.slice(AUTH_PREFIX.length);
  }

  // 2. Fall back to cookie
  return null; // Will be checked via cookies() below
}

async function extractTokenFromCookie(): string | null {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

// ── Get current session (checks header first, then cookie) ──

export async function getCurrentSession(request?: NextRequest) {
  // Try Authorization header first
  const headerToken = extractToken(request);
  const cookieToken = await extractTokenFromCookie();
  const token = headerToken || cookieToken;

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

// ── Cookie helpers (secondary, for page refresh backup) ──────

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 0,
    path: '/',
  });
}

export async function cleanupExpiredSessions() {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
