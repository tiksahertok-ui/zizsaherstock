import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticated, readPortfolio, savePortfolio } from '@/lib/supabase/server'
import type { HoldingRecord } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/holdings/[id]/transactions
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

    return NextResponse.json(holding.transactions)
  } catch (err) {
    console.error('Error fetching transactions:', err)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

// POST /api/holdings/[id]/transactions
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { supabase, user } = await getAuthenticated()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { type, shares, price, date, notes } = body

    if (!type || !['BUY', 'SELL'].includes(type)) {
      return NextResponse.json({ error: 'type must be BUY or SELL' }, { status: 400 })
    }
    const intShares = Math.round(shares)
    if (isNaN(intShares) || intShares <= 0 || price <= 0 || !date) {
      return NextResponse.json({ error: 'Invalid transaction data' }, { status: 400 })
    }

    const holdings = readPortfolio(user)
    const holding = holdings.find((h) => h.id === id)
    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
    }

    if (type === 'SELL' && intShares > holding.shares) {
      return NextResponse.json(
        { error: `Insufficient shares. You hold ${holding.shares} but tried to sell ${intShares}` },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    const total = intShares * price
    const txDate = new Date(date).toISOString()

    const tx = {
      id: crypto.randomUUID(),
      holdingId: id,
      type,
      shares: intShares,
      price,
      total,
      date: txDate,
      notes: notes?.trim() || null,
      createdAt: now,
    }

    holding.transactions.unshift(tx)

    // Recalculate shares and avgCost
    if (type === 'BUY') {
      const totalShares = holding.shares + intShares
      holding.avgCost = ((holding.shares * holding.avgCost) + total) / totalShares
      holding.shares = totalShares
    } else {
      holding.shares -= intShares
    }
    holding.updatedAt = now

    await savePortfolio(supabase, holdings)
    return NextResponse.json(tx, { status: 201 })
  } catch (err) {
    console.error('Error creating transaction:', err)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}
