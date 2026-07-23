import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

// GET /api/holdings — Return all holdings with transactions for the authenticated user
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const holdings = await db.holding.findMany({
      where: { accountId: session.account.id },
      include: { transactions: { orderBy: { date: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      holdings: holdings.map(h => ({
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        shares: h.shares,
        avgCost: h.avgCost,
        purchaseDate: h.purchaseDate.toISOString(),
        createdAt: h.createdAt.toISOString(),
        updatedAt: h.updatedAt.toISOString(),
        transactions: h.transactions.map(t => ({
          id: t.id,
          holdingId: t.holdingId,
          type: t.type,
          shares: t.shares,
          price: t.price,
          total: t.total,
          date: t.date.toISOString(),
          notes: t.notes,
          createdAt: t.createdAt.toISOString(),
        })),
      })),
    });
  } catch (err) {
    console.error('Error fetching holdings:', err);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }
}

// POST /api/holdings — Add a new holding
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { symbol, name, shares, avgCost, purchaseDate, transaction } = body;

    if (!symbol || !name || !shares || !avgCost) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const intShares = Math.round(shares);
    if (isNaN(intShares) || intShares <= 0 || avgCost <= 0) {
      return NextResponse.json({ error: 'Invalid shares or avgCost' }, { status: 400 });
    }

    const upperSymbol = symbol.trim().toUpperCase();

    // Check for duplicate
    const existing = await db.holding.findFirst({
      where: { accountId: session.account.id, symbol: upperSymbol },
    });
    if (existing) {
      return NextResponse.json({ error: `"${upperSymbol}" already exists in your portfolio` }, { status: 409 });
    }

    let parsedDate = new Date();
    if (purchaseDate) {
      const d = new Date(purchaseDate);
      if (!isNaN(d.getTime())) parsedDate = d;
    }

    // Create holding with initial transaction
    const holding = await db.holding.create({
      data: {
        symbol: upperSymbol,
        name: name.trim(),
        shares: intShares,
        avgCost,
        purchaseDate: parsedDate,
        accountId: session.account.id,
        transactions: transaction ? {
          create: {
            type: transaction.type || 'BUY',
            shares: transaction.shares || intShares,
            price: transaction.price || avgCost,
            total: (transaction.shares || intShares) * (transaction.price || avgCost),
            date: new Date(transaction.date || parsedDate),
            notes: transaction.notes || null,
          },
        } : undefined,
      },
      include: { transactions: { orderBy: { date: 'desc' } } },
    });

    return NextResponse.json({
      id: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      shares: holding.shares,
      avgCost: holding.avgCost,
      purchaseDate: holding.purchaseDate.toISOString(),
      createdAt: holding.createdAt.toISOString(),
      updatedAt: holding.updatedAt.toISOString(),
      transactions: holding.transactions.map(t => ({
        id: t.id,
        holdingId: t.holdingId,
        type: t.type,
        shares: t.shares,
        price: t.price,
        total: t.total,
        date: t.date.toISOString(),
        notes: t.notes,
        createdAt: t.createdAt.toISOString(),
      })),
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating holding:', err);
    return NextResponse.json({ error: 'Failed to create holding' }, { status: 500 });
  }
}