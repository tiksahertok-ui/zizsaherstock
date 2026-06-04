/**
 * Watchlist Store — localStorage-based watchlist manager
 * Stores an array of stock symbols in localStorage key "egx_watchlist"
 */

const STORAGE_KEY = 'egx_watchlist';

export function getWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s: unknown) => typeof s === 'string');
  } catch {
    return [];
  }
}

export function addToWatchlist(symbol: string): string[] {
  const list = getWatchlist();
  const upper = symbol.toUpperCase().trim();
  if (!upper || list.includes(upper)) return list;
  const newList = [...list, upper];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
  return newList;
}

export function removeFromWatchlist(symbol: string): string[] {
  const list = getWatchlist();
  const upper = symbol.toUpperCase().trim();
  const newList = list.filter(s => s !== upper);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
  return newList;
}

export function isWatched(symbol: string): boolean {
  return getWatchlist().includes(symbol.toUpperCase().trim());
}
