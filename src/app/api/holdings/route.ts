import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticated, readPortfolio, savePortfolio } from '@/lib/supabase/server'
import type { HoldingRecord } from '@/lib/supabase/server'

// GET /api/holdings
export async function GET() {
  try {
    const { user } = await getAuthenticated()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const holdings = readPortfolio(user)
    return NextResponse.json({ holdings })
  } catch (err) {
    console.error('Error fetching holdings:', err)
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 })
  }
}

// POST /api/holdings
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticated()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { symbol, name, shares, avgCost, purchaseDate, transaction } = body

    if (!symbol || !name || !shares || !avgCost) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const intShares = Math.round(shares)
    if (isNaN(intShares) || intShares <= 0 || avgCost <= 0) {
      return NextResponse.json({ error: 'Invalid shares or avgCost' }, { status: 400 })
    }

    const upperSymbol = symbol.trim().toUpperCase()
    const holdings = readPortfolio(user)

    if (holdings.some((h) => h.symbol === upperSymbol)) {
      return NextResponse.json({ error: `"${upperSymbol}" already exists in your portfolio` }, { status: 409 })
    }

    const now = new Date().toISOString()
    let parsedDate = now
    if (purchaseDate) {
      const d = new Date(purchaseDate)
      if (!isNaN(d.getTime())) parsedDate = d.toISOString()
    }

    const txId = crypto.randomUUID()
    const transactions = transaction
      ? [{
          id: txId,
          holdingId: crypto.randomUUID(),
          type: transaction.type || 'BUY',
          shares: transaction.shares || intShares,
          price: transaction.price || avgCost,
          total: (transaction.shares || intShares) * (transaction.price || avgCost),
          date: new Date(transaction.date || parsedDate).toISOString(),
          notes: transaction.notes || null,
          createdAt: now,
        }]
      : []

    const newHolding: HoldingRecord = {
      id: crypto.randomUUID(),
      symbol: upperSymbol,
      name: name.trim(),
      shares: intShares,
      avgCost,
      purchaseDate: parsedDate,
      createdAt: now,
      updatedAt: now,
      transactions,
    }

    // Fix holdingId in transaction
    if (transactions.length > 0) {
      transactions[0].holdingId = newHolding.id
    }

    holdings.unshift(newHolding)
    await savePortfolio(supabase, holdings)

    return NextResponse.json(newHolding, { status: 201 })
  } catch (err) {
    console.error('Error creating holding:', err)
    return NextResponse.json({ error: 'Failed to create holding', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
