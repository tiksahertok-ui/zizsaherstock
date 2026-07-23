import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/holdings/[id]
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const holding = await db.holding.findFirst({
      where: { id, accountId: session.account.id },
      include: { transactions: { orderBy: { date: 'desc' } } },
    });

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

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
        id: t.id, holdingId: t.holdingId, type: t.type,
        shares: t.shares, price: t.price, total: t.total,
        date: t.date.toISOString(), notes: t.notes, createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('Error fetching holding:', err);
    return NextResponse.json({ error: 'Failed to fetch holding' }, { status: 500 });
  }
}

// PUT /api/holdings/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { shares, avgCost, name, purchaseDate } = body;

    // Verify ownership
    const existing = await db.holding.findFirst({
      where: { id, accountId: session.account.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (shares !== undefined) {
      const s = Math.round(shares);
      if (s <= 0) return NextResponse.json({ error: 'Invalid shares' }, { status: 400 });
      updateData.shares = s;
    }
    if (avgCost !== undefined) {
      if (avgCost <= 0) return NextResponse.json({ error: 'Invalid avgCost' }, { status: 400 });
      updateData.avgCost = avgCost;
    }
    if (purchaseDate !== undefined) {
      const d = new Date(purchaseDate);
      if (!isNaN(d.getTime())) updateData.purchaseDate = d;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const holding = await db.holding.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: holding.id, symbol: holding.symbol, name: holding.name,
      shares: holding.shares, avgCost: holding.avgCost,
      purchaseDate: holding.purchaseDate.toISOString(),
      createdAt: holding.createdAt.toISOString(), updatedAt: holding.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error('Error updating holding:', err);
    return NextResponse.json({ error: 'Failed to update holding' }, { status: 500 });
  }
}

// DELETE /api/holdings/[id]
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.holding.findFirst({
      where: { id, accountId: session.account.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    await db.holding.delete({ where: { id } });

    return NextResponse.json({ success: true, deleted: existing.symbol });
  } catch (err) {
    console.error('Error deleting holding:', err);
    return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 });
  }
}
