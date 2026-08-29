import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Creates a Supabase client for Route Handlers.
 * Collects cookies that Supabase wants to set and returns them
 * so the caller can attach them to the response.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const collected: Array<{ name: string; value: string; options: CookieOptions }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((c) => collected.push(c))
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll can throw in Route Handlers — we collect cookies instead
          }
        },
      },
    },
  )

  return { supabase, collected }
}

/** Get the authenticated user (server-side) via cookie session */
export async function getAuthUser() {
  const { supabase } = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ?? null
}

/** Get Supabase client + authenticated user in one call */
export async function getAuthenticated() {
  const { supabase, collected } = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, collected }
  return { supabase, user, collected }
}

/**
 * Helper to attach collected Supabase cookies to a NextResponse
 */
export function attachCookies(
  response: NextResponse,
  collected: Array<{ name: string; value: string; options: CookieOptions }>,
) {
  for (const { name, value, options } of collected) {
    response.cookies.set(name, value, options)
  }
  return response
}

/**
 * Create a JSON response with Supabase cookies attached
 */
export function jsonResponse(data: unknown, init?: ResponseInit, collected?: Array<{ name: string; value: string; options: CookieOptions }>) {
  const response = NextResponse.json(data, init)
  if (collected?.length) {
    attachCookies(response, collected)
  }
  return response
}

// ── Types for portfolio stored in user_metadata.portfolio ──

export interface HoldingRecord {
  id: string
  symbol: string
  name: string
  shares: number
  avgCost: number
  purchaseDate: string
  createdAt: string
  updatedAt: string
  transactions: TransactionRecord[]
}

export interface TransactionRecord {
  id: string
  holdingId: string
  type: string
  shares: number
  price: number
  total: number
  date: string
  notes: string | null
  createdAt: string
}

interface PortfolioData {
  holdings?: HoldingRecord[]
}

/** Read portfolio from user metadata */
export function readPortfolio(user: { user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null }): HoldingRecord[] {
  const meta = user.user_metadata || user.raw_user_meta_data || {}
  const portfolio = meta.portfolio as PortfolioData | undefined
  return portfolio?.holdings || []
}

/** Save portfolio into user metadata via updateUser */
export async function savePortfolio(supabase: ReturnType<Awaited<ReturnType<typeof createClient>>['supabase']>, holdings: HoldingRecord[]): Promise<void> {
  await supabase.auth.updateUser({
    data: { portfolio: { holdings } },
  })
}
