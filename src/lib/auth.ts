import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'egx-session';
const AUTH_HEADER = 'authorization';
const CUSTOM_TOKEN_HEADER = 'x-auth-token';
const AUTH_PREFIX = 'Bearer ';
const TOKEN_QUERY_PARAM = '_t';
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

// ── Extract token from request (header OR cookie) ────────────

export async function getCurrentSession(request?: NextRequest) {
  let token: string | null = null;

  // 1. Try Authorization header
  const authHeader = request?.headers.get(AUTH_HEADER);
  if (authHeader?.startsWith(AUTH_PREFIX)) {
    token = authHeader.slice(AUTH_PREFIX.length);
  }

  // 2. Try custom X-Auth-Token header (survives most proxies)
  if (!token) {
    const customHeader = request?.headers.get(CUSTOM_TOKEN_HEADER);
    if (customHeader) {
      token = customHeader;
    }
  }

  // 3. Try query parameter ?_t=xxx (last resort, works through any proxy)
  if (!token && request) {
    const url = new URL(request.url);
    const qToken = url.searchParams.get(TOKEN_QUERY_PARAM);
    if (qToken) {
      token = qToken;
    }
  }

  // 4. Fall back to cookie
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
    } catch {
      // cookies() not available in this context
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

// ── Cookie helpers (backup only — token is primary) ──────────

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE);
}

export async function cleanupExpiredSessions() {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
