import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticated, readPortfolio, savePortfolio } from '@/lib/supabase/server'
import type { HoldingRecord } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/holdings/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await getAuthenticated()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const holdings = readPortfolio(user)
    const holding = holdings.find((h) => h.id === id)

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
    }

    return NextResponse.json(holding)
  } catch (err) {
    console.error('Error fetching holding:', err)
    return NextResponse.json({ error: 'Failed to fetch holding' }, { status: 500 })
  }
}

// PUT /api/holdings/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { supabase, user } = await getAuthenticated()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { shares, avgCost, name, purchaseDate } = body

    const holdings = readPortfolio(user)
    const idx = holdings.findIndex((h) => h.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
    }

    const holding = holdings[idx]
    if (name !== undefined) holding.name = name.trim()
    if (shares !== undefined) {
      const s = Math.round(shares)
      if (s <= 0) return NextResponse.json({ error: 'Invalid shares' }, { status: 400 })
      holding.shares = s
    }
    if (avgCost !== undefined) {
      if (avgCost <= 0) return NextResponse.json({ error: 'Invalid avgCost' }, { status: 400 })
      holding.avgCost = avgCost
    }
    if (purchaseDate !== undefined) {
      const d = new Date(purchaseDate)
      if (!isNaN(d.getTime())) holding.purchaseDate = d.toISOString()
    }
    holding.updatedAt = new Date().toISOString()

    holdings[idx] = holding
    await savePortfolio(supabase, holdings)

    return NextResponse.json(holding)
  } catch (err) {
    console.error('Error updating holding:', err)
    return NextResponse.json({ error: 'Failed to update holding' }, { status: 500 })
  }
}

// DELETE /api/holdings/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { supabase, user } = await getAuthenticated()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const holdings = readPortfolio(user)
    const idx = holdings.findIndex((h) => h.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
    }

    const deleted = holdings[idx].symbol
    holdings.splice(idx, 1)
    await savePortfolio(supabase, holdings)

    return NextResponse.json({ success: true, deleted })
  } catch (err) {
    console.error('Error deleting holding:', err)
    return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 })
  }
}
