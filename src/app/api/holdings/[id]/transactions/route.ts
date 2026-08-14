import { NextRequest } from 'next/server'
import { getAuthenticated, readPortfolio, savePortfolio, jsonResponse } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/holdings/[id]/transactions
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user, collected } = await getAuthenticated()
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, collected)
    }

    const { id } = await params
    const holdings = readPortfolio(user)
    const holding = holdings.find((h) => h.id === id)
    if (!holding) {
      return jsonResponse({ error: 'Holding not found' }, { status: 404 }, collected)
    }

    return jsonResponse(holding.transactions, undefined, collected)
  } catch (err) {
    console.error('Error fetching transactions:', err)
    return jsonResponse({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

// POST /api/holdings/[id]/transactions
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { supabase, user, collected } = await getAuthenticated()
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, collected)
    }

    const { id } = await params
    const body = await request.json()
    const { type, shares, price, date, notes } = body

    if (!type || !['BUY', 'SELL'].includes(type)) {
      return jsonResponse({ error: 'type must be BUY or SELL' }, { status: 400 })
    }
    const intShares = Math.round(shares)
    if (isNaN(intShares) || intShares <= 0 || price <= 0 || !date) {
      return jsonResponse({ error: 'Invalid transaction data' }, { status: 400 })
    }

    const holdings = readPortfolio(user)
    const holding = holdings.find((h) => h.id === id)
    if (!holding) {
      return jsonResponse({ error: 'Holding not found' }, { status: 404 }, collected)
    }

    if (type === 'SELL' && intShares > holding.shares) {
      return jsonResponse(
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
    return jsonResponse(tx, { status: 201 }, collected)
  } catch (err) {
    console.error('Error creating transaction:', err)
    return jsonResponse({ error: 'Failed to create transaction' }, { status: 500 })
  }
}
