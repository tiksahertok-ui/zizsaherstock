import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

let SETUP_SQL = '';

/**
 * GET /api/db-setup
 * Checks if Supabase tables exist and returns setup status.
 */
export async function GET() {
  try {
    // Load SQL from supabase-schema.sql
    if (!SETUP_SQL) {
      try {
        SETUP_SQL = readFileSync(join(process.cwd(), 'supabase-schema.sql'), 'utf-8');
      } catch {
        SETUP_SQL = '-- Please run the SQL from supabase-schema.sql in your Supabase SQL Editor';
      }
    }

    // Dynamic import to avoid build issues
    const { supabase } = await import('@/lib/supabase');

    // Try to query the holding table (lowercase, unquoted — standard PostgreSQL)
    const { error } = await supabase
      .from("holding")
      .select("id")
      .limit(1);

    if (!error) {
      return NextResponse.json({ setup: true, version: 3 });
    }

    // Error codes that mean "table doesn't exist"
    const msg = (error.message || "").toLowerCase();
    const code = error.code || "";

    if (
      msg.includes("does not exist") ||
      msg.includes("relation") ||
      code === "42P01" ||
      code === "PGRST116"
    ) {
      return NextResponse.json({
        setup: false,
        sql: SETUP_SQL,
        message:
          "Database tables need to be created. Copy the SQL below and run it in your Supabase Dashboard \u2192 SQL Editor.",
      });
    }

    // Other error (RLS policy issue, network error, etc.)
    return NextResponse.json({
      setup: false,
      error: error.message,
      sql: SETUP_SQL,
      message:
        "Database check failed. Try running the SQL in Supabase Dashboard \u2192 SQL Editor.",
    });
  } catch (err) {
    return NextResponse.json({
      setup: false,
      error: err instanceof Error ? err.message : "Unknown error",
      message: "Could not connect to Supabase. Check your credentials.",
    });
  }
}
