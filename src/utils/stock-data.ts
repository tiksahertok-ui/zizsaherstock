// ── Stock Data Helpers ─────────────────────────────────────────
// Wraps EGX_STOCKS from egx-stocks.ts with sector aggregation utilities.

import { EGX_STOCKS } from '@/lib/egx-stocks';

export type StockInfo = (typeof EGX_STOCKS)[number];

export interface SectorAggregation {
  sector: string;
  value: number;
  percent: number;
  count: number;
}

/**
 * Aggregate holdings by sector.
 * Takes an array of { symbol, marketValue } items and maps each to its sector
 * from EGX_STOCKS, then sums up value and computes percentages.
 */
export function aggregateBySector(
  items: Array<{ symbol: string; marketValue: number }>
): SectorAggregation[] {
  const total = items.reduce((s, h) => s + h.marketValue, 0);
  if (total === 0) return [];

  const sectorMap = new Map<string, { value: number; count: number }>();
  for (const item of items) {
    const stockInfo = EGX_STOCKS.find(s => s.symbol === item.symbol);
    const sector = stockInfo?.sector || 'Other';
    const existing = sectorMap.get(sector) || { value: 0, count: 0 };
    existing.value += item.marketValue;
    existing.count += 1;
    sectorMap.set(sector, existing);
  }

  return Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      value: data.value,
      percent: (data.value / total) * 100,
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Get the sector for a given stock symbol.
 * Returns 'Other' if the stock is not found in EGX_STOCKS.
 */
export function getStockSector(symbol: string): string {
  const stock = EGX_STOCKS.find(s => s.symbol === symbol);
  return stock?.sector || 'Other';
}

/**
 * Get all unique sectors from EGX_STOCKS, sorted alphabetically.
 */
export function getAllSectors(): string[] {
  const sectors = new Set(EGX_STOCKS.map(s => s.sector));
  return Array.from(sectors).sort();
}

// Re-export EGX_STOCKS for convenience
export { EGX_STOCKS } from '@/lib/egx-stocks';
