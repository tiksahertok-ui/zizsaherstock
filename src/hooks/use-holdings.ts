'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import type {
  Holding, Transaction, StoredHolding,
  StockOption, PortfolioSummary, SortField, SortDir,
} from '@/types';
import { enrichHolding } from '@/utils/formatters';

// ── Profile type (matches DB auth response) ──────────────────────
export interface Profile {
  id: string;
  username: string;
}

// ── DB response shape from GET /api/holdings ─────────────────────
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

/** Convert a raw DB holding into a StoredHolding with computed defaults */
function toStoredHolding(db: DbHolding): StoredHolding {
  const currentPrice = db.avgCost;
  const marketValue = db.shares * currentPrice;
  const costBasis = db.shares * db.avgCost;
  const pnl = 0;
  const pnlPercent = 0;
  const dayChange = 0;
  const dayChangePercent = 0;

  return {
    ...db,
    currentPrice,
    marketValue,
    costBasis,
    pnl,
    pnlPercent,
    dayChange,
    dayChangePercent,
    transactions: db.transactions.map((t) => ({ ...t })),
  };
}

// ── Return type ───────────────────────────────────────────────────
export interface UseHoldingsReturn {
  // Auth state
  profile: Profile | null;
  authenticated: boolean;
  hydrated: boolean;
  isRegisterMode: boolean;
  setIsRegisterMode: (v: boolean) => void;
  loginUsername: string;
  setLoginUsername: (v: string) => void;
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

  // Holdings data
  holdings: StoredHolding[];
  setHoldings: React.Dispatch<React.SetStateAction<StoredHolding[]>>;
  loading: boolean;
  fetchHoldings: () => Promise<void>;

  // Sorting
  sortField: SortField;
  sortDir: SortDir;
  sortedHoldings: StoredHolding[];
  toggleSort: (field: SortField) => void;

  // Dialogs
  addDialogOpen: boolean;
  setAddDialogOpen: (v: boolean) => void;
  editDialogOpen: boolean;
  setEditDialogOpen: (v: boolean) => void;
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (v: boolean) => void;
  txDialogOpen: boolean;
  setTxDialogOpen: (v: boolean) => void;

  // Selection
  selectedHolding: Holding | null;
  setSelectedHolding: (h: Holding | null) => void;

  // Search / stock picker
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedStock: StockOption | null;
  setSelectedStock: (s: StockOption | null) => void;

  // Add-holding form
  formShares: string;
  setFormShares: (v: string) => void;
  formAvgCost: string;
  setFormAvgCost: (v: string) => void;
  formPurchaseDate: string;
  setFormPurchaseDate: (v: string) => void;

  // Transaction form
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

  // CRUD handlers
  handleAddHolding: () => void;
  handleUpdateHolding: () => void;
  handleDeleteHolding: () => void;
  handleAddTransaction: () => void;
  fetchTransactions: (holdingId: string) => void;

  // Dialog openers
  openEditDialog: (holding: Holding) => void;
  openDeleteDialog: (holding: Holding) => void;
  openTxDialog: (holding: Holding) => void;

  // Form resets
  resetForm: () => void;
  resetTxForm: () => void;

  // Computed summary
  summary: PortfolioSummary | null;
}

// ── Hook ─────────────────────────────────────────────────────────
export function useHoldings(): UseHoldingsReturn {
  // ── Auth state ─────────────────────────────────────────────────
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // ── Holdings data ─────────────────────────────────────────────
  const [holdings, setHoldings] = useState<StoredHolding[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Sorting ───────────────────────────────────────────────────
  const [sortField, setSortField] = useState<SortField>('marketValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Dialogs ───────────────────────────────────────────────────
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);

  // ── Selection ──────────────────────────────────────────────────
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  // ── Search / stock picker ──────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null);

  // ── Add-holding form ───────────────────────────────────────────
  const [formShares, setFormShares] = useState('');
  const [formAvgCost, setFormAvgCost] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // ── Transaction form ───────────────────────────────────────────
  const [formTxType, setFormTxType] = useState<'BUY' | 'SELL'>('BUY');
  const [formTxShares, setFormTxShares] = useState('');
  const [formTxPrice, setFormTxPrice] = useState('');
  const [formTxDate, setFormTxDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formTxNotes, setFormTxNotes] = useState('');

  // ── Check session on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.account) {
            setProfile({ id: data.account.id, username: data.account.username });
            setAuthenticated(true);
          }
        }
      } catch {
        // Not authenticated — that's fine on mount
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    checkSession();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch holdings after auth is established ───────────────────
  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/holdings');
      if (!res.ok) {
        if (res.status === 401) {
          // Session expired — clear auth state
          setProfile(null);
          setAuthenticated(false);
          setHoldings([]);
          return;
        }
        throw new Error('Failed to fetch holdings');
      }
      const data = await res.json();
      const mapped: StoredHolding[] = (data.holdings ?? []).map(toStoredHolding);
      setHoldings(mapped);
    } catch (err) {
      console.error('fetchHoldings error:', err);
      toast.error('Failed to load holdings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch when authenticated
  useEffect(() => {
    if (authenticated) {
      fetchHoldings();
    }
  }, [authenticated, fetchHoldings]);

  // ── Login ──────────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    setLoginError('');
    setAuthLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.error || 'Login failed');
        return;
      }

      if (data.success && data.account) {
        setProfile({ id: data.account.id, username: data.account.username });
        setAuthenticated(true);
        setLoginUsername('');
        setLoginPassword('');
        toast.success(`Welcome back, ${data.account.username}!`);
      }
    } catch {
      setLoginError('Network error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  }, [loginUsername, loginPassword]);

  // ── Register ──────────────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    setLoginError('');
    setAuthLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.error || 'Registration failed');
        return;
      }

      if (data.success && data.account) {
        setProfile({ id: data.account.id, username: data.account.username });
        setAuthenticated(true);
        setLoginUsername('');
        setLoginPassword('');
        setConfirmPassword('');
        setIsRegisterMode(false);
        toast.success(`Account created! Welcome, ${data.account.username}!`);
      }
    } catch {
      setLoginError('Network error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  }, [loginUsername, loginPassword]);

  // ── Logout ─────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort
    } finally {
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

  // ── Sorting ───────────────────────────────────────────────────
  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case 'marketValue':
          cmp = a.marketValue - b.marketValue;
          break;
        case 'pnl':
          cmp = a.pnl - b.pnl;
          break;
        case 'pnlPercent':
          cmp = a.pnlPercent - b.pnlPercent;
          break;
        case 'dayChange':
          cmp = a.dayChange - b.dayChange;
          break;
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

  // ── Add holding ────────────────────────────────────────────────
  const handleAddHolding = useCallback(async () => {
    if (!selectedStock) {
      toast.error('Please select a stock');
      return;
    }
    const shares = parseInt(formShares, 10);
    const avgCost = parseFloat(formAvgCost);
    if (!shares || shares <= 0 || !avgCost || avgCost <= 0) {
      toast.error('Please enter valid shares and average cost');
      return;
    }

    const purchaseDate = formPurchaseDate || format(new Date(), 'yyyy-MM-dd');

    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedStock.symbol,
          name: selectedStock.name,
          shares,
          avgCost,
          purchaseDate,
          transaction: {
            type: 'BUY',
            shares,
            price: avgCost,
            date: purchaseDate,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to add holding');
        return;
      }

      // Add to local state (optimistically with DB response)
      const newHolding = toStoredHolding(data);
      setHoldings((prev) => [newHolding, ...prev]);
      setAddDialogOpen(false);
      resetForm();
      toast.success(`Added ${selectedStock.symbol} to portfolio`);
    } catch {
      toast.error('Failed to add holding');
    }
  }, [selectedStock, formShares, formAvgCost, formPurchaseDate]);

  // ── Update holding ─────────────────────────────────────────────
  const handleUpdateHolding = useCallback(async () => {
    if (!selectedHolding) return;

    const shares = parseInt(formShares, 10);
    const avgCost = parseFloat(formAvgCost);
    if (!shares || shares <= 0 || !avgCost || avgCost <= 0) {
      toast.error('Please enter valid shares and average cost');
      return;
    }

    try {
      const res = await fetch(`/api/holdings/${selectedHolding.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shares,
          avgCost,
          purchaseDate: formPurchaseDate || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to update holding');
        return;
      }

      // Update local state
      setHoldings((prev) =>
        prev.map((h) => {
          if (h.id !== selectedHolding.id) return h;
          return toStoredHolding({
            ...h,
            ...data,
            transactions: h.transactions,
          } as unknown as DbHolding);
        }),
      );
      setEditDialogOpen(false);
      setSelectedHolding(null);
      toast.success(`Updated ${selectedHolding.symbol}`);
    } catch {
      toast.error('Failed to update holding');
    }
  }, [selectedHolding, formShares, formAvgCost, formPurchaseDate]);

  // ── Delete holding ────────────────────────────────────────────
  const handleDeleteHolding = useCallback(async () => {
    if (!selectedHolding) return;

    try {
      const res = await fetch(`/api/holdings/${selectedHolding.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete holding');
        return;
      }

      setHoldings((prev) => prev.filter((h) => h.id !== selectedHolding.id));
      setDeleteDialogOpen(false);
      setSelectedHolding(null);
      toast.success(`Removed ${data.deleted || selectedHolding.symbol} from portfolio`);
    } catch {
      toast.error('Failed to delete holding');
    }
  }, [selectedHolding]);

  // ── Add transaction ───────────────────────────────────────────
  const handleAddTransaction = useCallback(async () => {
    if (!selectedHolding) return;

    const shares = parseInt(formTxShares, 10);
    const price = parseFloat(formTxPrice);
    if (!shares || shares <= 0 || !price || price <= 0) {
      toast.error('Please enter valid shares and price');
      return;
    }
    if (!formTxDate) {
      toast.error('Please enter a transaction date');
      return;
    }

    try {
      const res = await fetch(`/api/holdings/${selectedHolding.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formTxType,
          shares,
          price,
          date: formTxDate,
          notes: formTxNotes.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to add transaction');
        return;
      }

      // The backend already updated holding shares/avgCost — re-fetch for consistency
      await fetchHoldings();

      setTxDialogOpen(false);
      setSelectedHolding(null);
      resetTxForm();
      toast.success(`${formTxType} ${shares} shares of ${selectedHolding.symbol}`);
    } catch {
      toast.error('Failed to add transaction');
    }
  }, [selectedHolding, formTxType, formTxShares, formTxPrice, formTxDate, formTxNotes, fetchHoldings]);

  // ── Fetch transactions for a specific holding (refreshes that holding) ─
  const fetchTransactions = useCallback(
    async (holdingId: string) => {
      try {
        const res = await fetch(`/api/holdings/${holdingId}`);
        if (!res.ok) return;
        const data = await res.json();
        // Merge updated data into local holdings state
        setHoldings((prev) =>
          prev.map((h) => {
            if (h.id !== holdingId) return h;
            return toStoredHolding({
              ...data,
              transactions: data.transactions ?? h.transactions,
            } as unknown as DbHolding);
          }),
        );
      } catch {
        // Silently ignore
      }
    },
    [],
  );

  // ── Dialog openers ───────────────────────────────────────────
  const openEditDialog = useCallback((holding: Holding) => {
    setSelectedHolding(holding);
    setFormShares(String(holding.shares));
    setFormAvgCost(String(holding.avgCost));
    setFormPurchaseDate(holding.purchaseDate ? format(new Date(holding.purchaseDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    setEditDialogOpen(true);
  }, []);

  const openDeleteDialog = useCallback((holding: Holding) => {
    setSelectedHolding(holding);
    setDeleteDialogOpen(true);
  }, []);

  const openTxDialog = useCallback((holding: Holding) => {
    setSelectedHolding(holding);
    setFormTxType('BUY');
    setFormTxShares('');
    setFormTxPrice('');
    setFormTxDate(format(new Date(), 'yyyy-MM-dd'));
    setFormTxNotes('');
    setTxDialogOpen(true);
  }, []);

  // ── Form resets ────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setSelectedStock(null);
    setFormShares('');
    setFormAvgCost('');
    setFormPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
  }, []);

  const resetTxForm = useCallback(() => {
    setFormTxType('BUY');
    setFormTxShares('');
    setFormTxPrice('');
    setFormTxDate(format(new Date(), 'yyyy-MM-dd'));
    setFormTxNotes('');
  }, []);

  // ── Portfolio summary (computed) ──────────────────────────────
  const summary: PortfolioSummary = useMemo(() => {
    if (holdings.length === 0) {
      return {
        totalInvestment: 0,
        totalMarketValue: 0,
        totalPnL: 0,
        totalPnLPercent: 0,
        todaysChange: 0,
        todaysChangePercent: 0,
        numberOfHoldings: 0,
        bestPerformer: null,
        worstPerformer: null,
      };
    }

    const totalInvestment = holdings.reduce((sum, h) => sum + h.costBasis, 0);
    const totalMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalPnL = totalMarketValue - totalInvestment;
    const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
    const todaysChange = holdings.reduce((sum, h) => sum + h.dayChange, 0);
    const todaysChangePercent =
      totalMarketValue > 0 ? (todaysChange / (totalMarketValue - todaysChange)) * 100 : 0;

    let bestPerformer: PortfolioSummary['bestPerformer'] = null;
    let worstPerformer: PortfolioSummary['worstPerformer'] = null;

    for (const h of holdings) {
      if (!bestPerformer || h.pnlPercent > bestPerformer.pnlPercent) {
        bestPerformer = { symbol: h.symbol, name: h.name, pnlPercent: h.pnlPercent, pnl: h.pnl };
      }
      if (!worstPerformer || h.pnlPercent < worstPerformer.pnlPercent) {
        worstPerformer = { symbol: h.symbol, name: h.name, pnlPercent: h.pnlPercent, pnl: h.pnl };
      }
    }

    return {
      totalInvestment,
      totalMarketValue,
      totalPnL,
      totalPnLPercent,
      todaysChange,
      todaysChangePercent,
      numberOfHoldings: holdings.length,
      bestPerformer,
      worstPerformer,
    };
  }, [holdings]);

  // ── Return ────────────────────────────────────────────────────
  return {
    // Auth
    profile,
    authenticated,
    hydrated,
    isRegisterMode,
    setIsRegisterMode,
    loginUsername,
    setLoginUsername,
    loginPassword,
    setLoginPassword,
    confirmPassword,
    setConfirmPassword,
    loginError,
    setLoginError,
    authLoading,
    handleLogin,
    handleRegister,
    handleLogout,

    // Holdings data
    holdings,
    setHoldings,
    loading,
    fetchHoldings,

    // Sorting
    sortField,
    sortDir,
    sortedHoldings,
    toggleSort,

    // Dialogs
    addDialogOpen,
    setAddDialogOpen,
    editDialogOpen,
    setEditDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    txDialogOpen,
    setTxDialogOpen,

    // Selection
    selectedHolding,
    setSelectedHolding,

    // Search / stock picker
    searchQuery,
    setSearchQuery,
    selectedStock,
    setSelectedStock,

    // Add-holding form
    formShares,
    setFormShares,
    formAvgCost,
    setFormAvgCost,
    formPurchaseDate,
    setFormPurchaseDate,

    // Transaction form
    formTxType,
    setFormTxType,
    formTxShares,
    setFormTxShares,
    formTxPrice,
    setFormTxPrice,
    formTxDate,
    setFormTxDate,
    formTxNotes,
    setFormTxNotes,

    // CRUD handlers
    handleAddHolding,
    handleUpdateHolding,
    handleDeleteHolding,
    handleAddTransaction,
    fetchTransactions,

    // Dialog openers
    openEditDialog,
    openDeleteDialog,
    openTxDialog,

    // Form resets
    resetForm,
    resetTxForm,

    // Summary
    summary,
  };
}
