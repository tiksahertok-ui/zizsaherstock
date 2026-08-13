'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import type {
  Holding, Transaction, StoredHolding,
  StockOption, PortfolioSummary, SortField, SortDir,
} from '@/types';

// ── Profile type ──────────────────────────────────────────────
export interface Profile {
  id: string;
  email: string;
}

// ── DB response shape ─────────────────────────────────────────
interface DbHolding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  purchaseDate: string;
  createdAt: string;
  updatedAt: string;
  transactions: DbTransaction[];
}

interface DbTransaction {
  id: string;
  holdingId: string;
  type: string;
  shares: number;
  price: number;
  total: number;
  date: string;
  notes: string | null;
  createdAt: string;
}

function toStoredHolding(db: DbHolding): StoredHolding {
  return {
    ...db,
    currentPrice: db.avgCost,
    marketValue: db.shares * db.avgCost,
    costBasis: db.shares * db.avgCost,
    pnl: 0,
    pnlPercent: 0,
    dayChange: 0,
    dayChangePercent: 0,
    transactions: db.transactions.map((t) => ({ ...t })),
  };
}

// ── Simple fetch helper (cookies sent automatically via credentials: 'include') ─
async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...options, headers, credentials: 'include' });
  let data: T;
  try { data = await res.json(); } catch { data = undefined as T; }
  return { ok: res.ok, status: res.status, data };
}

// ── Return type ───────────────────────────────────────────────
export interface UseHoldingsReturn {
  profile: Profile | null;
  authenticated: boolean;
  hydrated: boolean;
  isRegisterMode: boolean;
  setIsRegisterMode: (v: boolean) => void;
  loginEmail: string;
  setLoginEmail: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  loginError: string;
  setLoginError: (v: string) => void;
  authLoading: boolean;
  handleLogin: () => void;
  handleRegister: () => void;
  handleLogout: () => void;
  holdings: StoredHolding[];
  setHoldings: React.Dispatch<React.SetStateAction<StoredHolding[]>>;
  loading: boolean;
  fetchHoldings: () => Promise<void>;
  sortField: SortField;
  sortDir: SortDir;
  sortedHoldings: StoredHolding[];
  toggleSort: (field: SortField) => void;
  addDialogOpen: boolean;
  setAddDialogOpen: (v: boolean) => void;
  editDialogOpen: boolean;
  setEditDialogOpen: (v: boolean) => void;
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (v: boolean) => void;
  txDialogOpen: boolean;
  setTxDialogOpen: (v: boolean) => void;
  selectedHolding: Holding | null;
  setSelectedHolding: (h: Holding | null) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedStock: StockOption | null;
  setSelectedStock: (s: StockOption | null) => void;
  formShares: string;
  setFormShares: (v: string) => void;
  formAvgCost: string;
  setFormAvgCost: (v: string) => void;
  formPurchaseDate: string;
  setFormPurchaseDate: (v: string) => void;
  formTxType: 'BUY' | 'SELL';
  setFormTxType: (v: 'BUY' | 'SELL') => void;
  formTxShares: string;
  setFormTxShares: (v: string) => void;
  formTxPrice: string;
  setFormTxPrice: (v: string) => void;
  formTxDate: string;
  setFormTxDate: (v: string) => void;
  formTxNotes: string;
  setFormTxNotes: (v: string) => void;
  handleAddHolding: () => void;
  handleUpdateHolding: () => void;
  handleDeleteHolding: () => void;
  handleAddTransaction: () => void;
  fetchTransactions: (holdingId: string) => void;
  openEditDialog: (holding: Holding) => void;
  openDeleteDialog: (holding: Holding) => void;
  openTxDialog: (holding: Holding) => void;
  resetForm: () => void;
  resetTxForm: () => void;
  summary: PortfolioSummary | null;
}

// ── Hook ──────────────────────────────────────────────────────
export function useHoldings(): UseHoldingsReturn {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [holdings, setHoldings] = useState<StoredHolding[]>([]);
  const [loading, setLoading] = useState(false);

  const [sortField, setSortField] = useState<SortField>('marketValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);

  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null);

  const [formShares, setFormShares] = useState('');
  const [formAvgCost, setFormAvgCost] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [formTxType, setFormTxType] = useState<'BUY' | 'SELL'>('BUY');
  const [formTxShares, setFormTxShares] = useState('');
  const [formTxPrice, setFormTxPrice] = useState('');
  const [formTxDate, setFormTxDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formTxNotes, setFormTxNotes] = useState('');

  // ── Check session on mount (cookie-based) ──
  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        const { ok, data } = await apiFetch<{ authenticated: boolean; account?: { id: string; email: string } }>('/api/auth/session');
        if (cancelled) return;
        if (ok && data.authenticated && data.account) {
          setProfile({ id: data.account.id, email: data.account.email });
          setAuthenticated(true);
        }
      } catch {
        // Not authenticated
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch holdings ──────────────────────────────────────────
  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, status, data } = await apiFetch<{ holdings?: DbHolding[] }>('/api/holdings');
      if (!ok) {
        if (status === 401) {
          setProfile(null);
          setAuthenticated(false);
          setHoldings([]);
        }
        return;
      }
      setHoldings(((data as { holdings?: DbHolding[] }).holdings ?? []).map(toStoredHolding));
    } catch (err) {
      console.error('fetchHoldings error:', err);
      toast.error('Failed to load holdings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchHoldings();
  }, [authenticated, fetchHoldings]);

  // ── Login ───────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    setLoginError('');
    setAuthLoading(true);
    try {
      const { ok, status, data } = await apiFetch<{ success?: boolean; account?: { id: string; email: string }; error?: string; detail?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      if (!ok) {
        const d = data as { error?: string; detail?: string };
        const msg = d?.detail ? `${d.error}: ${d.detail}` : (d?.error || 'Login failed');
        setLoginError(`${msg} (${status})`);
        return;
      }
      const d = data as { success: boolean; account: { id: string; email: string } };
      if (d.success && d.account) {
        setProfile({ id: d.account.id, email: d.account.email });
        setAuthenticated(true);
        setLoginEmail('');
        setLoginPassword('');
        toast.success('Welcome back!');
      } else {
        setLoginError('Unexpected response from server');
      }
    } catch (err) {
      setLoginError(`Connection error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setAuthLoading(false);
    }
  }, [loginEmail, loginPassword]);

  // ── Register ────────────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    setLoginError('');
    setAuthLoading(true);
    try {
      const { ok, status, data } = await apiFetch<{ success?: boolean; account?: { id: string; email: string }; error?: string; detail?: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      if (!ok) {
        const d = data as { error?: string; detail?: string };
        const msg = d?.detail ? `${d.error}: ${d.detail}` : (d?.error || 'Registration failed');
        setLoginError(`${msg} (${status})`);
        return;
      }
      const d = data as { success: boolean; account: { id: string; email: string } };
      if (d.success && d.account) {
        setProfile({ id: d.account.id, email: d.account.email });
        setAuthenticated(true);
        setLoginEmail('');
        setLoginPassword('');
        setConfirmPassword('');
        setIsRegisterMode(false);
        toast.success('Account created successfully!');
      } else {
        setLoginError('Unexpected response from server');
      }
    } catch (err) {
      setLoginError(`Connection error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setAuthLoading(false);
    }
  }, [loginEmail, loginPassword]);

  // ── Logout ──────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch { /* best-effort */ } finally {
      setProfile(null);
      setAuthenticated(false);
      setHoldings([]);
      setAddDialogOpen(false);
      setEditDialogOpen(false);
      setDeleteDialogOpen(false);
      setTxDialogOpen(false);
      setSelectedHolding(null);
      toast.success('Logged out');
    }
  }, []);

  // ── Sorting ─────────────────────────────────────────────────
  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'marketValue': cmp = a.marketValue - b.marketValue; break;
        case 'pnl': cmp = a.pnl - b.pnl; break;
        case 'pnlPercent': cmp = a.pnlPercent - b.pnlPercent; break;
        case 'dayChange': cmp = a.dayChange - b.dayChange; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [holdings, sortField, sortDir]);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      setSortDir((d) => (prev === field ? (d === 'asc' ? 'desc' : 'asc') : 'desc'));
      return field;
    });
  }, []);

  // ── Add holding ─────────────────────────────────────────────
  const handleAddHolding = useCallback(async () => {
    if (!selectedStock) { toast.error('Please select a stock'); return; }
    const shares = parseInt(formShares, 10);
    const avgCost = parseFloat(formAvgCost);
    if (!shares || shares <= 0 || !avgCost || avgCost <= 0) {
      toast.error('Please enter valid shares and average cost'); return;
    }
    const purchaseDate = formPurchaseDate || format(new Date(), 'yyyy-MM-dd');
    try {
      const { ok, data } = await apiFetch<DbHolding>('/api/holdings', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedStock.symbol, name: selectedStock.name,
          shares, avgCost, purchaseDate,
          transaction: { type: 'BUY', shares, price: avgCost, date: purchaseDate },
        }),
      });
      if (!ok) { toast.error((data as { error?: string }).error || 'Failed to add holding'); return; }
      setHoldings((prev) => [toStoredHolding(data as DbHolding), ...prev]);
      setAddDialogOpen(false); resetForm();
      toast.success(`Added ${selectedStock.symbol} to portfolio`);
    } catch { toast.error('Failed to add holding'); }
  }, [selectedStock, formShares, formAvgCost, formPurchaseDate]);

  // ── Update holding ──────────────────────────────────────────
  const handleUpdateHolding = useCallback(async () => {
    if (!selectedHolding) return;
    const shares = parseInt(formShares, 10);
    const avgCost = parseFloat(formAvgCost);
    if (!shares || shares <= 0 || !avgCost || avgCost <= 0) {
      toast.error('Please enter valid shares and average cost'); return;
    }
    try {
      const { ok, data } = await apiFetch<DbHolding>(`/api/holdings/${selectedHolding.id}`, {
        method: 'PUT',
        body: JSON.stringify({ shares, avgCost, purchaseDate: formPurchaseDate || undefined }),
      });
      if (!ok) { toast.error((data as { error?: string }).error || 'Failed to update holding'); return; }
      setHoldings((prev) => prev.map((h) => {
        if (h.id !== selectedHolding.id) return h;
        return toStoredHolding({ ...h, ...data, transactions: h.transactions } as unknown as DbHolding);
      }));
      setEditDialogOpen(false); setSelectedHolding(null);
      toast.success(`Updated ${selectedHolding.symbol}`);
    } catch { toast.error('Failed to update holding'); }
  }, [selectedHolding, formShares, formAvgCost, formPurchaseDate]);

  // ── Delete holding ──────────────────────────────────────────
  const handleDeleteHolding = useCallback(async () => {
    if (!selectedHolding) return;
    try {
      const { ok, data } = await apiFetch<{ deleted?: string }>(`/api/holdings/${selectedHolding.id}`, { method: 'DELETE' });
      if (!ok) { toast.error((data as { error?: string }).error || 'Failed to delete holding'); return; }
      setHoldings((prev) => prev.filter((h) => h.id !== selectedHolding.id));
      setDeleteDialogOpen(false); setSelectedHolding(null);
      toast.success(`Removed ${(data as { deleted?: string }).deleted || selectedHolding.symbol} from portfolio`);
    } catch { toast.error('Failed to delete holding'); }
  }, [selectedHolding]);

  // ── Add transaction ─────────────────────────────────────────
  const handleAddTransaction = useCallback(async () => {
    if (!selectedHolding) return;
    const shares = parseInt(formTxShares, 10);
    const price = parseFloat(formTxPrice);
    if (!shares || shares <= 0 || !price || price <= 0) {
      toast.error('Please enter valid shares and price'); return;
    }
    if (!formTxDate) { toast.error('Please enter a transaction date'); return; }
    try {
      const { ok, data } = await apiFetch(`/api/holdings/${selectedHolding.id}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          type: formTxType, shares, price, date: formTxDate,
          notes: formTxNotes.trim() || null,
        }),
      });
      if (!ok) { toast.error((data as { error?: string }).error || 'Failed to add transaction'); return; }
      await fetchHoldings();
      setTxDialogOpen(false); setSelectedHolding(null); resetTxForm();
      toast.success(`${formTxType} ${shares} shares of ${selectedHolding.symbol}`);
    } catch { toast.error('Failed to add transaction'); }
  }, [selectedHolding, formTxType, formTxShares, formTxPrice, formTxDate, formTxNotes, fetchHoldings]);

  // ── Fetch single holding transactions ───────────────────────
  const fetchTransactions = useCallback(async (holdingId: string) => {
    try {
      const { ok, data } = await apiFetch<DbHolding>(`/api/holdings/${holdingId}`);
      if (!ok) return;
      setHoldings((prev) => prev.map((h) => {
        if (h.id !== holdingId) return h;
        return toStoredHolding({ ...data, transactions: (data as DbHolding).transactions ?? h.transactions } as unknown as DbHolding);
      }));
    } catch { /* ignore */ }
  }, []);

  // ── Dialog openers ─────────────────────────────────────────
  const openEditDialog = useCallback((holding: Holding) => {
    setSelectedHolding(holding);
    setFormShares(String(holding.shares));
    setFormAvgCost(String(holding.avgCost));
    setFormPurchaseDate(holding.purchaseDate ? format(new Date(holding.purchaseDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    setEditDialogOpen(true);
  }, []);

  const openDeleteDialog = useCallback((holding: Holding) => {
    setSelectedHolding(holding); setDeleteDialogOpen(true);
  }, []);

  const openTxDialog = useCallback((holding: Holding) => {
    setSelectedHolding(holding);
    setFormTxType('BUY'); setFormTxShares(''); setFormTxPrice('');
    setFormTxDate(format(new Date(), 'yyyy-MM-dd')); setFormTxNotes('');
    setTxDialogOpen(true);
  }, []);

  // ── Form resets ─────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setSelectedStock(null); setFormShares(''); setFormAvgCost('');
    setFormPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
  }, []);

  const resetTxForm = useCallback(() => {
    setFormTxType('BUY'); setFormTxShares(''); setFormTxPrice('');
    setFormTxDate(format(new Date(), 'yyyy-MM-dd')); setFormTxNotes('');
  }, []);

  // ── Summary ─────────────────────────────────────────────────
  const summary: PortfolioSummary = useMemo(() => {
    if (holdings.length === 0) {
      return { totalInvestment: 0, totalMarketValue: 0, totalPnL: 0, totalPnLPercent: 0,
        todaysChange: 0, todaysChangePercent: 0, numberOfHoldings: 0,
        bestPerformer: null, worstPerformer: null };
    }
    const totalInvestment = holdings.reduce((s, h) => s + h.costBasis, 0);
    const totalMarketValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const totalPnL = totalMarketValue - totalInvestment;
    const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
    const todaysChange = holdings.reduce((s, h) => s + h.dayChange, 0);
    const todaysChangePercent = totalMarketValue > 0 ? (todaysChange / (totalMarketValue - todaysChange)) * 100 : 0;
    let best: PortfolioSummary['bestPerformer'] = null;
    let worst: PortfolioSummary['worstPerformer'] = null;
    for (const h of holdings) {
      if (!best || h.pnlPercent > best.pnlPercent) best = { symbol: h.symbol, name: h.name, pnlPercent: h.pnlPercent, pnl: h.pnl };
      if (!worst || h.pnlPercent < worst.pnlPercent) worst = { symbol: h.symbol, name: h.name, pnlPercent: h.pnlPercent, pnl: h.pnl };
    }
    return { totalInvestment, totalMarketValue, totalPnL, totalPnLPercent, todaysChange, todaysChangePercent, numberOfHoldings: holdings.length, bestPerformer: best, worstPerformer: worst };
  }, [holdings]);

  // ── Return ──────────────────────────────────────────────────
  return {
    profile, authenticated, hydrated, isRegisterMode, setIsRegisterMode,
    loginEmail, setLoginEmail, loginPassword, setLoginPassword,
    confirmPassword, setConfirmPassword, loginError, setLoginError, authLoading,
    handleLogin, handleRegister, handleLogout,
    holdings, setHoldings, loading, fetchHoldings,
    sortField, sortDir, sortedHoldings, toggleSort,
    addDialogOpen, setAddDialogOpen, editDialogOpen, setEditDialogOpen,
    deleteDialogOpen, setDeleteDialogOpen, txDialogOpen, setTxDialogOpen,
    selectedHolding, setSelectedHolding,
    searchQuery, setSearchQuery, selectedStock, setSelectedStock,
    formShares, setFormShares, formAvgCost, setFormAvgCost, formPurchaseDate, setFormPurchaseDate,
    formTxType, setFormTxType, formTxShares, setFormTxShares,
    formTxPrice, setFormTxPrice, formTxDate, setFormTxDate, formTxNotes, setFormTxNotes,
    handleAddHolding, handleUpdateHolding, handleDeleteHolding, handleAddTransaction, fetchTransactions,
    openEditDialog, openDeleteDialog, openTxDialog, resetForm, resetTxForm, summary,
  };
}
