'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getMarketStatus } from '@/utils/market-status';

// ── Preset Refresh Intervals ──────────────────────────────────
// Each interval applies ONLY during EGX market hours.
// After market close, ALL auto-refreshes stop automatically.

export const REFRESH_INTERVALS = {
  /** EGX30 index / Individual stock data — 30 seconds */
  STOCKS: 30_000,
  /** Gold prices / FX (USD/EGP) rates — 60 seconds */
  GOLD_FX: 60_000,
  /** Stock screener filtered results — 2 minutes */
  SCREENER: 120_000,
  /** Sector overview & sector-level aggregation — 5 minutes */
  SECTOR: 300_000,
  /** AI research reports & insights — 10 minutes (server-side cached 24h) */
  AI_RESEARCH: 600_000,
} as const;

// ── Hook Options ──────────────────────────────────────────────

interface UseAutoRefreshOptions {
  /** Unique key identifying this refresh consumer (used for debugging) */
  key: string;
  /** Milliseconds between automatic refreshes during market hours */
  intervalMs: number;
  /** Async function to call on each refresh cycle */
  fetchFn: () => Promise<void>;
  /** Master switch — set to `false` to pause all refreshes for this instance */
  enabled?: boolean;
}

// ── Hook Return Value ──────────────────────────────────────────

interface UseAutoRefreshReturn {
  /** `true` while a fetch is in-flight (prevents concurrent fetches) */
  isRefreshing: boolean;
  /** Unix timestamp (ms) of the last successful refresh, or `null` if never fetched */
  lastUpdated: number | null;
  /** Imperative trigger — manually request a refresh (respects market-hours guard) */
  refresh: () => Promise<void>;
  /** Milliseconds elapsed since the last successful refresh */
  elapsed: number;
  /** `true` when elapsed time exceeds the configured interval (data is considered stale) */
  isStale: boolean;
}

// ── Elapsed-time ticker resolution (ms) ──────────────────────
const ELAPSED_TICK_MS = 1_000;

// ── Hook Implementation ────────────────────────────────────────

export function useAutoRefresh({
  key,
  intervalMs,
  fetchFn,
  enabled = true,
}: UseAutoRefreshOptions): UseAutoRefreshReturn {
  // ── State ──────────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // ── Refs (persist across renders without triggering re-renders) ──
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  const lastUpdatedRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);

  // Keep refs in sync with props / state so callbacks always read latest values
  enabledRef.current = enabled;

  // Keep a stable ref to fetchFn so the interval callback never goes stale
  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  // ── Derived ─────────────────────────────────────────────────
  const isStale = elapsed > intervalMs;

  // ── Core refresh logic (guarded against concurrent calls) ───
  const refresh = useCallback(async () => {
    // Guard: skip if already in-flight
    if (isRefreshingRef.current) return;
    // Guard: skip if master switch is off
    if (!enabledRef.current) return;
    // Guard: skip if market is closed (all refreshes stop after close)
    const status = getMarketStatus();
    if (status.egx !== 'live') return;

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      await fetchFnRef.current();
      const now = Date.now();
      lastUpdatedRef.current = now;
      setLastUpdated(now);
      // Reset elapsed immediately after successful fetch
      setElapsed(0);
    } catch (err) {
      // Log for debugging but don't crash — the next interval will retry
      console.error(`[useAutoRefresh:${key}] fetch error:`, err);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [key]);

  // ── Start / stop the auto-refresh interval ───────────────────
  const startInterval = useCallback(() => {
    // Clear any existing interval first (idempotent)
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only run during market hours
    const status = getMarketStatus();
    if (status.egx !== 'live') return;
    if (!enabledRef.current) return;

    // Fire immediately on start, then on each interval tick
    void refresh();
    intervalRef.current = setInterval(() => {
      void refresh();
    }, intervalMs);
  }, [intervalMs, refresh]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Elapsed-time ticker ─────────────────────────────────────
  // Updates `elapsed` every second so UI can show staleness indicators
  // without requiring a re-render on every fetch cycle.
  useEffect(() => {
    elapsedTimerRef.current = setInterval(() => {
      const last = lastUpdatedRef.current;
      if (last !== null) {
        setElapsed(Date.now() - last);
      }
    }, ELAPSED_TICK_MS);

    return () => {
      if (elapsedTimerRef.current !== null) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, []);

  // ── Lifecycle: start on mount, stop on unmount ─────────────
  useEffect(() => {
    startInterval();
    return () => {
      stopInterval();
    };
  }, [startInterval, stopInterval]);

  // ── React to `enabled` changes ───────────────────────────────
  useEffect(() => {
    if (enabled) {
      startInterval();
    } else {
      stopInterval();
    }
  }, [enabled, startInterval, stopInterval]);

  // ── Visibility change handler ────────────────────────────────
  // When the user returns to the tab and data is stale, fetch immediately.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!enabledRef.current) return;

      // If data is stale (or never fetched), trigger an immediate refresh
      const last = lastUpdatedRef.current;
      const neverFetched = last === null;
      const dataIsStale = last !== null && Date.now() - last > intervalMs;

      if (neverFetched || dataIsStale) {
        void refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [intervalMs, refresh]);

  return {
    isRefreshing,
    lastUpdated,
    refresh,
    elapsed,
    isStale,
  } satisfies UseAutoRefreshReturn;
}
