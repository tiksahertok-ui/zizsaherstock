/**
 * Server-side Auth Helper
 *
 * Extracts and validates the JWT from the Authorization header
 * in API routes. Returns the authenticated user's ID and email.
 */

import { NextRequest } from 'next/server';
import { supabase } from './supabase';

export interface AuthUser {
  userId: string;
  email: string;
}

/**
 * Authenticate a request by extracting the Bearer token
 * from the Authorization header and validating it with Supabase Auth.
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthUser | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.slice(7);
    if (!token) return null;

    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      console.warn('Auth validation failed:', error?.message);
      return null;
    }

    return {
      userId: data.user.id,
      email: data.user.email ?? '',
    };
  } catch (err) {
    console.error('Auth error:', err);
    return null;
  }
}

/**
 * Returns a 401 response for unauthenticated requests.
 */
export function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: 'Unauthorized — please sign in' }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
