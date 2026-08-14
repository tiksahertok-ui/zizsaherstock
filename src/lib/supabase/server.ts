import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // setAll called from Server Component — middleware handles refresh
          }
        },
      },
    },
  )
}

/** Get the authenticated user (server-side) via cookie session */
export async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

/** Get Supabase client + authenticated user in one call */
export async function getAuthenticated() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null }
  return { supabase, user }
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
export async function savePortfolio(supabase: ReturnType<Awaited<ReturnType<typeof createClient>>>, holdings: HoldingRecord[]): Promise<void> {
  await supabase.auth.updateUser({
    data: { portfolio: { holdings } },
  })
}
