import { NextRequest } from 'next/server'
import { getAuthenticated, readPortfolio, savePortfolio, jsonResponse } from '@/lib/supabase/server'
import type { HoldingRecord } from '@/lib/supabase/server'

// GET /api/holdings
export async function GET() {
  try {
    const { user, collected } = await getAuthenticated()
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, collected)
    }

    const holdings = readPortfolio(user)
    return jsonResponse({ holdings }, undefined, collected)
  } catch (err) {
    console.error('Error fetching holdings:', err)
    return jsonResponse({ error: 'Failed to fetch holdings' }, { status: 500 })
  }
}

// POST /api/holdings
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, collected } = await getAuthenticated()
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, collected)
    }

    const body = await request.json()
    const { symbol, name, shares, avgCost, purchaseDate, transaction } = body

    if (!symbol || !name || !shares || !avgCost) {
      return jsonResponse({ error: 'Missing required fields' }, { status: 400 })
    }

    const intShares = Math.round(shares)
    if (isNaN(intShares) || intShares <= 0 || avgCost <= 0) {
      return jsonResponse({ error: 'Invalid shares or avgCost' }, { status: 400 })
    }

    const upperSymbol = symbol.trim().toUpperCase()
    const holdings = readPortfolio(user)

    if (holdings.some((h) => h.symbol === upperSymbol)) {
      return jsonResponse({ error: `"${upperSymbol}" already exists in your portfolio` }, { status: 409 })
    }

    const now = new Date().toISOString()
    let parsedDate = now
    if (purchaseDate) {
      const d = new Date(purchaseDate)
      if (!isNaN(d.getTime())) parsedDate = d.toISOString()
    }

    const txId = crypto.randomUUID()
    const newHolding: HoldingRecord = {
      id: crypto.randomUUID(),
      symbol: upperSymbol,
      name: name.trim(),
      shares: intShares,
      avgCost,
      purchaseDate: parsedDate,
      createdAt: now,
      updatedAt: now,
      transactions: transaction
        ? [{
            id: txId,
            holdingId: '', // will be set below
            type: transaction.type || 'BUY',
            shares: transaction.shares || intShares,
            price: transaction.price || avgCost,
            total: (transaction.shares || intShares) * (transaction.price || avgCost),
            date: new Date(transaction.date || parsedDate).toISOString(),
            notes: transaction.notes || null,
            createdAt: now,
          }]
        : [],
    }

    // Fix holdingId in transaction
    if (newHolding.transactions.length > 0) {
      newHolding.transactions[0].holdingId = newHolding.id
    }

    holdings.unshift(newHolding)
    await savePortfolio(supabase, holdings)

    return jsonResponse(newHolding, { status: 201 }, collected)
  } catch (err) {
    console.error('Error creating holding:', err)
    return jsonResponse({ error: 'Failed to create holding', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
