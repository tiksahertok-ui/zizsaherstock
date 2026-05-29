'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

import type {
  StockOption,
  IndexData,
  StockPerformance,
  TechnicalAnalysisData,
  ExtrasData,
  PriceChange,
  StoredHolding,
} from '@/types';
import { enrichHolding } from '@/utils/formatters';
import {
  PRICE_CHANGE_PREFIX,
  getEgyptTodayStr,
  computeDailyChange,
  cleanupOldDailyEntries,
} from '@/utils/formatters';

// ── Hook Return Type ──────────────────────────────────────────

export interface UseMarketDataReturn {
  // Market data state
  availableStocks: StockOption[];
  indexData: IndexData[];
  perfData: Record<string, StockPerformance>;
  extrasData: ExtrasData | null;
  taData: Record<string, TechnicalAnalysisData>;
  taLoading: boolean;

  // Price change tracking state
  goldEgpChanges: Record<string, PriceChange>;
  usdEgpClientChange: PriceChange;

  // Loading state
  loading: boolean;
  refreshing: boolean;

  // Actions
  fetchAll: (showRefresh?: boolean) => void;

  // Setters for holdings (needed for live price enrichment)
  setHoldings: React.Dispatch<React.SetStateAction<StoredHolding[]>>;
}

// ── Hook Implementation ───────────────────────────────────────

export function useMarketData(
  hydrated: boolean,
  profile: unknown,
  holdings: StoredHolding[],
  setHoldings: React.Dispatch<React.SetStateAction<StoredHolding[]>>
): UseMarketDataReturn {
  // ── Data state ───────────────────────────────────────────────
  const [availableStocks, setAvailableStocks] = useState<StockOption[]>([]);
  const [indexData, setIndexData] = useState<IndexData[]>([]);
  const [perfData, setPerfData] = useState<Record<string, StockPerformance>>({});
  const [extrasData, setExtrasData] = useState<ExtrasData | null>(null);
  const [taData, setTaData] = useState<Record<string, TechnicalAnalysisData>>({});
  const [taLoading, setTaLoading] = useState(false);

  // ── Client-side price change tracking ────────────────────────
  const [goldEgpChanges, setGoldEgpChanges] = useState<Record<string, PriceChange>>({});
  const [usdEgpClientChange, setUsdEgpClientChange] = useState<PriceChange>({ changeAbs: 0, changePercent: 0 });

  // ── Loading state ────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Initial full load (called once + after CRUD operations) ──
  const fetchAll = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [stocksRes, extrasRes] = await Promise.allSettled([
        fetch('/api/market-data/stocks', { cache: 'no-store' }),
        fetch('/api/market-data/extras', { cache: 'no-store' }),
      ]);

      if (stocksRes.status === 'fulfilled' && stocksRes.value.ok) {
        const stocks = await stocksRes.value.json();
        setAvailableStocks(Array.isArray(stocks) ? stocks : []);
      }

      if (extrasRes.status === 'fulfilled' && extrasRes.value.ok) {
        setExtrasData(await extrasRes.value.json());
      }
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load portfolio data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Trigger initial fetch when profile is ready
  useEffect(() => {
    if (!hydrated || !profile) return;
    const timer = window.setTimeout(() => void fetchAll(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchAll, hydrated, profile]);

  // ── LIVE data polling (every 5s) ──
  // Fetches holdings with fresh prices + indices + gold + USD/EGP
  const fetchLiveData = useCallback(async () => {
    try {
      const indexSymbols = 'EGX30,EGX70_EWI,EGX100_EWI';
      const holdingSymbols = holdings.map(h => h.symbol).join(',');
      const symbols = [indexSymbols, holdingSymbols].filter(Boolean).join(',');
      const liveRes = await fetch(`/api/market-data/live?symbols=${symbols}`, { cache: 'no-store' });

      if (liveRes.ok) {
        const data = await liveRes.json();

        // Update holdings with fresh prices
        if (data.stocks && holdings.length > 0) {
          setHoldings(prev => prev.map(h => enrichHolding(h, data.stocks[h.symbol])));
        }

        // Update index data
        if (data.stocks) {
          setIndexData(prev => {
            const updated = prev.map(idx => {
              const live = data.stocks[idx.symbol];
              if (live) {
                return {
                  ...idx,
                  currentPrice: live.price || idx.currentPrice,
                  changePercent: live.changePercent || idx.changePercent,
                  changeAbs: live.changeAbs || idx.changeAbs,
                  volume: live.volume || idx.volume,
                };
              }
              return idx;
            });

            // Populate indices from live data if not yet present
            if (prev.length === 0 && Object.keys(data.stocks).length > 0) {
              const idxNames: Record<string, string> = {
                EGX30: 'EGX 30', EGX70_EWI: 'EGX 70 EWI', EGX100_EWI: 'EGX 100 EWI',
              };
              for (const [sym, live] of Object.entries(data.stocks)) {
                if (!idxNames[sym]) continue;
                const d = live as { price: number; changePercent: number; changeAbs: number; volume: number };
                if (d.price > 0) {
                  updated.push({
                    symbol: sym,
                    name: idxNames[sym],
                    currentPrice: d.price,
                    changePercent: d.changePercent,
                    changeAbs: d.changeAbs,
                    open: 0, high: 0, low: 0, volume: d.volume,
                  });
                }
              }
            }
            return updated;
          });
        }

        // Update gold & USD/EGP into extrasData (from TradingView live)
        if (data.gold || data.usdEgp) {
          setExtrasData(prev => {
            if (!prev) {
              return {
                usdEgp: {
                  rate: data.usdEgp?.rate || 0,
                  changePercent: data.usdEgp?.changePercent || 0,
                  changeAbs: data.usdEgp?.changeAbs || 0,
                  source: 'TradingView',
                  hasChangeData: true,
                },
                gold: {
                  usdPrice: data.gold?.usdPrice || 0,
                  usdChangePercent: data.gold?.changePercent || 0,
                  usdChangeAbs: data.gold?.changeAbs || 0,
                  perGram24kEgp: 0,
                  perGram21kEgp: 0,
                  perGram24kHigh: 0,
                  perGram24kLow: 0,
                  perGram21kHigh: 0,
                  perGram21kLow: 0,
                  perGram24kUsd: 0,
                  perGram21kUsd: 0,
                  changePercent: 0,
                  changeAbs: 0,
                  egpSource: '',
                  karats: {},
                },
                marketStatus: data.marketStatus || undefined,
              };
            }
            return {
              ...prev,
              gold: {
                ...prev.gold,
                usdPrice: data.gold?.usdPrice || prev.gold.usdPrice,
                usdChangePercent: data.gold?.changePercent ?? prev.gold.usdChangePercent,
                usdChangeAbs: data.gold?.changeAbs ?? prev.gold.usdChangeAbs,
              },
              usdEgp: {
                ...prev.usdEgp,
                rate: data.usdEgp?.rate || prev.usdEgp.rate,
                ...(data.usdEgp && data.usdEgp.changePercent !== 0 ? {
                  changePercent: data.usdEgp.changePercent,
                  changeAbs: data.usdEgp.changeAbs,
                } : {}),
                source: prev.usdEgp.source || 'TradingView',
                hasChangeData: true,
              },
              ...(data.marketStatus ? { marketStatus: data.marketStatus } : {}),
            };
          });
        }
      }
    } catch {
      // Silent fail for background polling
    }
  }, [holdings, setHoldings]);

  // ── Comprehensive update (every 60s) ──
  const fetchComprehensive = useCallback(async () => {
    try {
      const [extrasRes, perfRes, taRes] = await Promise.allSettled([
        fetch('/api/market-data/extras', { cache: 'no-store' }),
        holdings.length > 0
          ? fetch(`/api/market-data/performance?symbols=${holdings.map(h => h.symbol).join(',')},EGX30,EGX70_EWI,EGX100_EWI,XAUUSD`, { cache: 'no-store' })
          : Promise.resolve(null),
        fetch('/api/market-data/technical-analysis?all=true', { cache: 'no-store' }),
      ]);

      if (extrasRes.status === 'fulfilled' && extrasRes.value.ok) {
        setExtrasData(await extrasRes.value.json());
      }

      if (perfRes.status === 'fulfilled' && perfRes.value && perfRes.value.ok) {
        setPerfData(await perfRes.value.json());
      }

      if (taRes.status === 'fulfilled' && taRes.value.ok) {
        setTaData(await taRes.value.json());
      }
      setTaLoading(false);
    } catch {
      setTaLoading(false);
    }
  }, [holdings.length]);

  // ── Polling schedule ──
  useEffect(() => {
    if (!hydrated || !profile) return;
    const firstComp = window.setTimeout(() => void fetchComprehensive(), 0);
    const firstLive = window.setTimeout(() => void fetchLiveData(), 0);
    const liveInterval = setInterval(fetchLiveData, 5_000);
    const compInterval = setInterval(fetchComprehensive, 60_000);
    return () => {
      clearTimeout(firstComp);
      clearTimeout(firstLive);
      clearInterval(liveInterval);
      clearInterval(compInterval);
    };
  }, [fetchLiveData, fetchComprehensive, hydrated, profile]);

  // ── Client-side gold EGP + USD/EGP change tracking ──
  useEffect(() => {
    if (!extrasData || typeof window === 'undefined') return;

    const today = getEgyptTodayStr();
    const changes: Record<string, PriceChange> = {};

    const goldItems: Array<{ key: string; price: number }> = [
      { key: '24k', price: extrasData.gold.perGram24kEgp },
      { key: '21k', price: extrasData.gold.perGram21kEgp },
      { key: 'pound', price: extrasData.gold.goldPoundEgp || 0 },
      { key: 'ounce', price: extrasData.gold.ounceEgp || 0 },
    ];

    if (extrasData.gold.karats['22']?.price) goldItems.push({ key: '22k', price: extrasData.gold.karats['22'].price });
    if (extrasData.gold.karats['18']?.price) goldItems.push({ key: '18k', price: extrasData.gold.karats['18'].price });

    for (const item of goldItems) {
      if (item.price > 0) {
        const storageKey = `${PRICE_CHANGE_PREFIX}${today}:gold-${item.key}`;
        changes[item.key] = computeDailyChange(storageKey, item.price);
      }
    }

    setGoldEgpChanges(changes);

    if (extrasData.usdEgp.rate > 0) {
      const usdKey = `${PRICE_CHANGE_PREFIX}${today}:usdegp`;
      setUsdEgpClientChange(computeDailyChange(usdKey, extrasData.usdEgp.rate));
    }

    // Cleanup old entries (run once per hour max)
    if (Math.random() < 0.001) cleanupOldDailyEntries();
  }, [extrasData]);

  return {
    availableStocks,
    indexData,
    perfData,
    extrasData,
    taData,
    taLoading,
    goldEgpChanges,
    usdEgpClientChange,
    loading,
    refreshing,
    fetchAll,
    setHoldings,
  };
}
