import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/holdings/[id]/transactions
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const holding = await db.holding.findFirst({
      where: { id, accountId: session.account.id },
    });
    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    const transactions = await db.transaction.findMany({
      where: { holdingId: id },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(transactions.map(t => ({
      id: t.id, holdingId: t.holdingId, type: t.type,
      shares: t.shares, price: t.price, total: t.total,
      date: t.date.toISOString(), notes: t.notes, createdAt: t.createdAt.toISOString(),
    })));
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

// POST /api/holdings/[id]/transactions — Add BUY/SELL transaction
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { type, shares, price, date, notes } = body;

    if (!type || !['BUY', 'SELL'].includes(type)) {
      return NextResponse.json({ error: 'type must be BUY or SELL' }, { status: 400 });
    }
    const intShares = Math.round(shares);
    if (isNaN(intShares) || intShares <= 0 || price <= 0 || !date) {
      return NextResponse.json({ error: 'Invalid transaction data' }, { status: 400 });
    }

    const holding = await db.holding.findFirst({
      where: { id, accountId: session.account.id },
    });
    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    const total = intShares * price;
    const txDate = new Date(date);

    if (type === 'SELL' && intShares > holding.shares) {
      return NextResponse.json(
        { error: `Insufficient shares. You hold ${holding.shares} but tried to sell ${intShares}` },
        { status: 400 }
      );
    }

    // Create transaction
    const transaction = await db.transaction.create({
      data: {
        holdingId: id, type, shares: intShares, price, total,
        date: txDate, notes: notes || null,
      },
    });

    // Update holding
    if (type === 'BUY') {
      const totalShares = holding.shares + intShares;
      const newAvgCost = ((holding.shares * holding.avgCost) + total) / totalShares;
      await db.holding.update({ where: { id }, data: { shares: totalShares, avgCost: newAvgCost } });
    } else {
      await db.holding.update({ where: { id }, data: { shares: holding.shares - intShares } });
    }

    return NextResponse.json({
      id: transaction.id, holdingId: transaction.holdingId, type: transaction.type,
      shares: transaction.shares, price: transaction.price, total: transaction.total,
      date: transaction.date.toISOString(), notes: transaction.notes,
      createdAt: transaction.createdAt.toISOString(),
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating transaction:', err);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}
