-- ================================================================
-- EGX Portfolio Tracker — Supabase Database Schema
-- ================================================================
-- Run this SQL in your Supabase SQL Editor:
-- https://supabase.com/dashboard → Your Project → SQL Editor
-- ================================================================

-- Enable UUID extension for ID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- 1. Profiles Table (extends Supabase Auth users)
-- ================================================================
-- Stores additional user data like username.
-- Created automatically via trigger when a new user signs up.
CREATE TABLE IF NOT EXISTS profiles (
  id        TEXT PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT NOT NULL,
  username  TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    (NEW.raw_user_meta_data ->> 'username')::TEXT
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- 2. Holdings Table
-- ================================================================
CREATE TABLE IF NOT EXISTS holding (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol       TEXT NOT NULL,
  name         TEXT NOT NULL,
  shares       INTEGER NOT NULL CHECK (shares > 0),
  avg_cost     NUMERIC(18, 4) NOT NULL CHECK (avg_cost > 0),
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, user_id)
);

CREATE INDEX IF NOT EXISTS idx_holding_user_id ON holding(user_id);
CREATE INDEX IF NOT EXISTS idx_holding_symbol ON holding(symbol);

-- ================================================================
-- 3. Transactions Table
-- ================================================================
CREATE TABLE IF NOT EXISTS "transaction" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holding(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  shares     INTEGER NOT NULL CHECK (shares > 0),
  price      NUMERIC(18, 4) NOT NULL CHECK (price > 0),
  total      NUMERIC(18, 4) NOT NULL,
  date       TIMESTAMPTZ NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_holding_id ON "transaction"(holding_id);
CREATE INDEX IF NOT EXISTS idx_transaction_date ON "transaction"(date);

-- ================================================================
-- 4. Trusted Email Table
-- ================================================================
-- Stores allowed email addresses and domain wildcards.
-- Supports exact emails (user@example.com) and domain wildcards (@example.com)
CREATE TABLE IF NOT EXISTS trusted_email (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default trusted domains
INSERT INTO trusted_email (email) VALUES
  ('@gmail.com'),
  ('@outlook.com'),
  ('@yahoo.com'),
  ('@icloud.com'),
  ('@hotmail.com'),
  ('@protonmail.com')
ON CONFLICT (email) DO NOTHING;

-- ================================================================
-- 5. Auto-update updated_at Trigger
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS holding_updated_at ON holding;
CREATE TRIGGER holding_updated_at BEFORE UPDATE ON holding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- 6. Row Level Security (RLS)
-- ================================================================
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction" ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own profile, update their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Holdings: users can only see and manage their own holdings
CREATE POLICY "Users can view own holdings"
  ON holding FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own holdings"
  ON holding FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own holdings"
  ON holding FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own holdings"
  ON holding FOR DELETE
  USING (auth.uid() = user_id);

-- Transactions: users can only access transactions for their holdings
CREATE POLICY "Users can view own transactions"
  ON "transaction" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM holding
      WHERE holding.id = "transaction".holding_id
      AND holding.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own transactions"
  ON "transaction" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM holding
      WHERE holding.id = "transaction".holding_id
      AND holding.user_id = auth.uid()
    )
  );

-- Trusted email: readable by anyone for the check-email API
CREATE POLICY "Allow read trusted_email"
  ON trusted_email FOR SELECT USING (true);

CREATE POLICY "Allow insert trusted_email"
  ON trusted_email FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow delete trusted_email"
  ON trusted_email FOR DELETE USING (true);

-- ================================================================
-- 7. Atomic Transaction RPC Function
-- ================================================================
CREATE OR REPLACE FUNCTION add_transaction(
  p_holding_id UUID,
  p_type       TEXT,
  p_shares     INTEGER,
  p_price      NUMERIC(18, 4),
  p_date       TIMESTAMPTZ,
  p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_holding     holding%ROWTYPE;
  v_new_avg_cost NUMERIC(18, 4);
  v_new_shares   INTEGER;
  v_tx_id        UUID;
BEGIN
  SELECT * INTO v_holding FROM holding WHERE id = p_holding_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holding not found';
  END IF;

  IF p_type = 'SELL' AND v_holding.shares < p_shares THEN
    RAISE EXCEPTION 'Insufficient shares: trying to sell % but only have %',
      p_shares, v_holding.shares;
  END IF;

  INSERT INTO "transaction" (holding_id, type, shares, price, total, date, notes)
  VALUES (p_holding_id, p_type, p_shares, p_price, p_shares * p_price, p_date, p_notes)
  RETURNING id INTO v_tx_id;

  IF p_type = 'BUY' THEN
    v_new_shares := v_holding.shares + p_shares;
    v_new_avg_cost := (
      (v_holding.shares * v_holding.avg_cost) + (p_shares * p_price)
    ) / v_new_shares;
    UPDATE holding SET shares = v_new_shares, avg_cost = v_new_avg_cost WHERE id = p_holding_id;
  ELSIF p_type = 'SELL' THEN
    v_new_shares := v_holding.shares - p_shares;
    UPDATE holding SET shares = v_new_shares WHERE id = p_holding_id;
  END IF;

  RETURN jsonb_build_object('id', v_tx_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
