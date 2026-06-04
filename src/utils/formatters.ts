// ── Formatting Helpers ───────────────────────────────────────────

import type { StoredHolding, PriceChange } from '@/types';

/** Format a number as Egyptian Pound currency */
export function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a number with configurable decimal places (default 2) */
export function fmtNumber(value: number, decimals?: number): string {
  const d = decimals ?? 2;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(value);
}

/** Format a percentage with sign prefix */
export function fmtPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Safe formatters — return "—" for null/undefined/unavailable data (Rule: never show 0 for missing) */
export function fmtCurrencySafe(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return '—';
  return fmtCurrency(value);
}

export function fmtPercentSafe(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return '—';
  return fmtPercent(value);
}

export function fmtNumberSafe(value: number | null | undefined, decimals?: number): string {
  if (value == null || !isFinite(value)) return '—';
  return fmtNumber(value, decimals);
}

/** Format "Updated X ago" timestamp */
export function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/** Format a currency change with sign prefix */
export function fmtChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${fmtCurrency(value)}`;
}

/** Return Tailwind color class for P&L text */
export function pnlColor(value: number): string {
  if (value > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

/** Return Tailwind color class for P&L background/border */
export function pnlBgColor(value: number): string {
  if (value > 0) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
  if (value < 0) return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
  return 'bg-muted text-muted-foreground border-border';
}

// ── ID & Profile Helpers ───────────────────────────────────────

export const ACTIVE_PROFILE_KEY = 'egx-portfolio-active-profile';
export const PROFILE_HOLDINGS_PREFIX = 'egx-portfolio-holdings:';

/** Generate a unique ID (crypto.randomUUID with fallback) */
export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Get the localStorage key for a profile's holdings */
export function getProfileStorageKey(profileId: string): string {
  return `${PROFILE_HOLDINGS_PREFIX}${profileId}`;
}

/** Create a deterministic profile ID from name + PIN */
export function createProfileId(label: string, pin: string): string {
  const normalized = `${label.trim().toLowerCase()}:${pin.trim()}`;
  return btoa(encodeURIComponent(normalized)).replace(/=+$/g, '');
}

/** Enrich a stored holding with live market quote data */
export function enrichHolding(
  holding: StoredHolding,
  quote?: { price?: number; close?: number; changeAbs?: number; changePercent?: number }
): StoredHolding {
  const currentPrice = quote?.price ?? quote?.close ?? holding.currentPrice ?? holding.avgCost;
  const dayChangePercent = quote?.changePercent ?? holding.dayChangePercent ?? 0;
  const changeAbs = quote?.changeAbs ?? 0;
  const marketValue = holding.shares * currentPrice;
  const costBasis = holding.shares * holding.avgCost;
  const pnl = marketValue - costBasis;
  const pnlPercent = holding.avgCost > 0 ? ((currentPrice - holding.avgCost) / holding.avgCost) * 100 : 0;

  return {
    ...holding,
    currentPrice,
    marketValue,
    costBasis,
    pnl,
    pnlPercent,
    dayChange: changeAbs * holding.shares,
    dayChangePercent,
    updatedAt: new Date().toISOString(),
  };
}

// ── Client-Side Price Change Tracking (localStorage) ──────────
// Tracks the FIRST price of each day for gold EGP items and USD/EGP.
// Computes daily change purely from Egyptian source prices.
// Survives serverless cold starts and page refreshes.

export const PRICE_CHANGE_PREFIX = 'egx-daily-open:';

/** Get today's date string in Egypt timezone */
export function getEgyptTodayStr(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })).toISOString().split('T')[0];
}

/** Compute price change from localStorage-tracked open price */
export function computeDailyChange(storageKey: string, currentPrice: number): PriceChange {
  if (!currentPrice || currentPrice <= 0) return { changeAbs: 0, changePercent: 0 };

  const storedOpen = localStorage.getItem(storageKey);
  if (!storedOpen) {
    // First price of the day — store it as the open reference
    localStorage.setItem(storageKey, String(currentPrice));
    return { changeAbs: 0, changePercent: 0 };
  }

  const openPrice = parseFloat(storedOpen);
  if (openPrice > 0) {
    const changeAbs = Math.round((currentPrice - openPrice) * 100) / 100;
    const changePercent = Math.round((changeAbs / openPrice) * 10000) / 100;
    return { changeAbs, changePercent };
  }

  return { changeAbs: 0, changePercent: 0 };
}

/** Clean up old localStorage entries (older than 2 days) to prevent bloat */
export function cleanupOldDailyEntries(): void {
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const cutoff = twoDaysAgo.toISOString().split('T')[0];

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PRICE_CHANGE_PREFIX)) {
      // Extract date from key: "egx-daily-open:2026-05-28:24k"
      const datePart = key.replace(PRICE_CHANGE_PREFIX, '').split(':')[0];
      if (datePart < cutoff) {
        keysToRemove.push(key);
      }
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}
