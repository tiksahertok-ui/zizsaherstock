import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/holdings/[id]/transactions — Get all transactions for a holding
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return unauthorizedResponse();
    }

    const { id } = await params;

    // Verify holding exists and belongs to the authenticated user
    const { data: holding, error: checkError } = await supabase
      .from("holding")
      .select("id")
      .eq("id", id)
      .eq("user_id", authUser.userId)
      .single();

    if (checkError || !holding) {
      return NextResponse.json(
        { error: "Holding not found" },
        { status: 404 }
      );
    }

    const { data: transactions, error } = await supabase
      .from("transaction")
      .select("*")
      .eq("holding_id", id)
      .order("date", { ascending: false });

    if (error) {
      console.error("Supabase error fetching transactions:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      (transactions ?? []).map((t) => ({
        id: t.id,
        holdingId: t.holding_id,
        type: t.type,
        shares: t.shares,
        price: Number(t.price),
        total: Number(t.total),
        date: new Date(t.date).toISOString(),
        notes: t.notes,
        createdAt: new Date(t.created_at).toISOString(),
      }))
    );
  } catch (error) {
    console.error("Error fetching transactions:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch transactions: ${msg}` },
      { status: 500 }
    );
  }
}

// POST /api/holdings/[id]/transactions — Add a transaction (BUY or SELL)
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return unauthorizedResponse();
    }

    const { id } = await params;
    const body = await request.json();
    const { type, shares, price, date, notes } = body;

    // Validate
    if (!type || !["BUY", "SELL"].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "BUY" or "SELL"' },
        { status: 400 }
      );
    }

    if (typeof shares !== "number" || shares <= 0) {
      return NextResponse.json(
        { error: "shares must be a positive whole number" },
        { status: 400 }
      );
    }

    const intShares = Math.round(shares);

    if (typeof price !== "number" || price <= 0) {
      return NextResponse.json(
        { error: "price must be a positive number" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: "date is required" },
        { status: 400 }
      );
    }

    // Verify holding exists and belongs to the authenticated user
    const { data: holding, error: holdingError } = await supabase
      .from("holding")
      .select("*")
      .eq("id", id)
      .eq("user_id", authUser.userId)
      .single();

    if (holdingError || !holding) {
      return NextResponse.json(
        { error: "Holding not found" },
        { status: 404 }
      );
    }

    const transactionDate = new Date(date);
    const total = intShares * price;
    const holdingAvgCost = Number(holding.avg_cost);

    // Handle BUY — increase shares, recalculate avgCost
    if (type === "BUY") {
      const totalShares = holding.shares + intShares;
      const totalCost = (holding.shares * holdingAvgCost) + total;
      const newAvgCost = totalCost / totalShares;

      // Insert transaction
      const { data: tx, error: txError } = await supabase
        .from("transaction")
        .insert({
          holding_id: id,
          type: "BUY",
          shares: intShares,
          price,
          total,
          date: transactionDate.toISOString(),
          notes: notes || null,
        })
        .select("*")
        .single();

      if (txError) {
        console.error("Supabase error inserting BUY transaction:", txError);
        return NextResponse.json(
          { error: `Failed to create transaction: ${txError.message}` },
          { status: 500 }
        );
      }

      // Update holding shares and avg_cost
      const { error: updateError } = await supabase
        .from("holding")
        .update({
          shares: totalShares,
          avg_cost: newAvgCost,
        })
        .eq("id", id);

      if (updateError) {
        console.error("Supabase error updating holding after BUY:", updateError);
        return NextResponse.json(
          { error: `Transaction created but failed to update holding: ${updateError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        id: tx.id,
        holdingId: tx.holding_id,
        type: tx.type,
        shares: tx.shares,
        price: Number(tx.price),
        total: Number(tx.total),
        date: new Date(tx.date).toISOString(),
        notes: tx.notes,
        createdAt: new Date(tx.created_at).toISOString(),
      }, { status: 201 });
    }

    // Handle SELL — check sufficient shares, decrease shares (avg_cost stays the same)
    if (type === "SELL") {
      if (intShares > holding.shares) {
        return NextResponse.json(
          { error: `Insufficient shares. You hold ${holding.shares} but tried to sell ${intShares}` },
          { status: 400 }
        );
      }

      const remainingShares = holding.shares - intShares;

      // Insert transaction
      const { data: tx, error: txError } = await supabase
        .from("transaction")
        .insert({
          holding_id: id,
          type: "SELL",
          shares: intShares,
          price,
          total,
          date: transactionDate.toISOString(),
          notes: notes || null,
        })
        .select("*")
        .single();

      if (txError) {
        console.error("Supabase error inserting SELL transaction:", txError);
        return NextResponse.json(
          { error: `Failed to create transaction: ${txError.message}` },
          { status: 500 }
        );
      }

      // Update holding shares (avg_cost stays the same on sell)
      const { error: updateError } = await supabase
        .from("holding")
        .update({
          shares: remainingShares,
        })
        .eq("id", id);

      if (updateError) {
        console.error("Supabase error updating holding after SELL:", updateError);
        return NextResponse.json(
          { error: `Transaction created but failed to update holding: ${updateError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        id: tx.id,
        holdingId: tx.holding_id,
        type: tx.type,
        shares: tx.shares,
        price: Number(tx.price),
        total: Number(tx.total),
        date: new Date(tx.date).toISOString(),
        notes: tx.notes,
        createdAt: new Date(tx.created_at).toISOString(),
      }, { status: 201 });
    }

    return NextResponse.json(
      { error: "Invalid transaction type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error creating transaction:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create transaction: ${msg}` },
      { status: 500 }
    );
  }
}
