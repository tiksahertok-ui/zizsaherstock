'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import type {
  Holding,
  Transaction,
  StoredHolding,
  LocalProfile,
  StockOption,
  PortfolioSummary,
  SortField,
  SortDir,
} from '@/types';
import {
  ACTIVE_PROFILE_KEY,
  createId,
  getProfileStorageKey,
  createProfileId,
  enrichHolding,
} from '@/utils/formatters';

// ── Hook Return Type ──────────────────────────────────────────

export interface UseHoldingsReturn {
  // Profile state
  profile: LocalProfile | null;
  hydrated: boolean;
  loginName: string;
  setLoginName: (v: string) => void;
  loginPin: string;
  setLoginPin: (v: string) => void;
  loginError: string;
  setLoginError: (v: string) => void;
  handlePortfolioLogin: () => void;
  logoutProfile: () => void;

  // Holdings state
  holdings: StoredHolding[];
  setHoldings: React.Dispatch<React.SetStateAction<StoredHolding[]>>;
  transactions: Transaction[];

  // Sort state
  sortField: SortField;
  sortDir: SortDir;
  sortedHoldings: StoredHolding[];
  toggleSort: (field: SortField) => void;

  // Dialog state
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

  // Form state
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

  // Actions
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

  // Computed
  summary: PortfolioSummary | null;
}

// ── Hook Implementation ───────────────────────────────────────

export function useHoldings(): UseHoldingsReturn {
  // ── Core state ───────────────────────────────────────────────
  const [holdings, setHoldings] = useState<StoredHolding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // ── Profile state ────────────────────────────────────────────
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  // ── Sort state ───────────────────────────────────────────────
  const [sortField, setSortField] = useState<SortField>('marketValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Dialog state ─────────────────────────────────────────────
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  // ── Form state ───────────────────────────────────────────────
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

  // ── Computed Summary ─────────────────────────────────────────
  const summary = useMemo<PortfolioSummary | null>(() => {
    if (holdings.length === 0) return null;
    const totalInvestment = holdings.reduce((s, h) => s + h.costBasis, 0);
    const totalMarketValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const totalPnL = totalMarketValue - totalInvestment;
    const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
    const todaysChange = holdings.reduce((s, h) => s + h.dayChange, 0);
    const todaysChangePercent = totalMarketValue - todaysChange > 0
      ? (todaysChange / (totalMarketValue - todaysChange)) * 100 : 0;
    const sorted = [...holdings].sort((a, b) => b.pnlPercent - a.pnlPercent);
    return {
      totalInvestment,
      totalMarketValue,
      totalPnL,
      totalPnLPercent,
      todaysChange,
      todaysChangePercent,
      numberOfHoldings: holdings.length,
      bestPerformer: sorted[0] ? { symbol: sorted[0].symbol, name: sorted[0].name, pnlPercent: sorted[0].pnlPercent, pnl: sorted[0].pnl } : null,
      worstPerformer: sorted[sorted.length - 1] ? { symbol: sorted[sorted.length - 1].symbol, name: sorted[sorted.length - 1].name, pnlPercent: sorted[sorted.length - 1].pnlPercent, pnl: sorted[sorted.length - 1].pnl } : null,
    };
  }, [holdings]);

  // ── Sorted Holdings ──────────────────────────────────────────
  const sortedHoldings = useMemo(() => {
    const sorted = [...holdings].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'marketValue': cmp = a.marketValue - b.marketValue; break;
        case 'pnl': cmp = a.pnl - b.pnl; break;
        case 'pnlPercent': cmp = a.pnlPercent - b.pnlPercent; break;
        case 'dayChange': cmp = a.dayChange - b.dayChange; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [holdings, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  // ── Hydration Effect ─────────────────────────────────────────
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedProfile = localStorage.getItem(ACTIVE_PROFILE_KEY);
        if (savedProfile) {
          const parsedProfile = JSON.parse(savedProfile) as LocalProfile;
          const savedHoldings = localStorage.getItem(getProfileStorageKey(parsedProfile.id));
          setProfile(parsedProfile);
          setHoldings(savedHoldings ? JSON.parse(savedHoldings) : []);
        }
      } catch {
        localStorage.removeItem(ACTIVE_PROFILE_KEY);
        setProfile(null);
        setHoldings([]);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // ── Persist holdings to localStorage ─────────────────────────
  useEffect(() => {
    if (!hydrated || !profile) return;
    localStorage.setItem(getProfileStorageKey(profile.id), JSON.stringify(holdings));
  }, [holdings, hydrated, profile]);

  // ── Profile Login / Logout ───────────────────────────────────
  const handlePortfolioLogin = () => {
    const label = loginName.trim();
    const pin = loginPin.trim();

    if (label.length < 2) {
      setLoginError('Enter a portfolio name with at least 2 characters');
      return;
    }
    if (pin.length < 4) {
      setLoginError('Enter a PIN with at least 4 characters');
      return;
    }

    const nextProfile = { id: createProfileId(label, pin), label };
    const savedHoldings = localStorage.getItem(getProfileStorageKey(nextProfile.id));

    setProfile(nextProfile);
    setHoldings(savedHoldings ? JSON.parse(savedHoldings) : []);
    setTransactions([]);
    setSelectedHolding(null);
    setLoginName('');
    setLoginPin('');
    setLoginError('');
    localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(nextProfile));
    toast.success(savedHoldings ? `Welcome back, ${label}` : `New portfolio created for ${label}`);
  };

  const logoutProfile = () => {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    setProfile(null);
    setHoldings([]);
    setTransactions([]);
    setSelectedHolding(null);
    toast.success('Portfolio locked');
  };

  // ── Holdings CRUD ────────────────────────────────────────────

  const handleAddHolding = () => {
    if (!selectedStock || !formShares || !formAvgCost) return;

    const shares = parseFloat(formShares);
    const avgCost = parseFloat(formAvgCost);
    if (isNaN(shares) || isNaN(avgCost) || shares <= 0 || avgCost <= 0) {
      toast.error('Invalid values');
      return;
    }

    const upperSymbol = selectedStock.symbol.trim().toUpperCase();
    if (holdings.some(h => h.symbol === upperSymbol)) {
      toast.error(`Holding with symbol "${upperSymbol}" already exists`);
      return;
    }

    const now = new Date().toISOString();
    const transaction: Transaction = {
      id: createId(),
      holdingId: '',
      type: 'BUY',
      shares: Math.round(shares),
      price: avgCost,
      total: Math.round(shares) * avgCost,
      date: new Date(formPurchaseDate).toISOString(),
      notes: null,
      createdAt: now,
    };
    const id = createId();
    transaction.holdingId = id;
    const holding = enrichHolding({
      id,
      symbol: upperSymbol,
      name: selectedStock.name,
      shares: Math.round(shares),
      avgCost,
      purchaseDate: new Date(formPurchaseDate).toISOString(),
      createdAt: now,
      updatedAt: now,
      currentPrice: selectedStock.currentPrice ?? avgCost,
      marketValue: 0,
      costBasis: 0,
      pnl: 0,
      pnlPercent: 0,
      dayChange: 0,
      dayChangePercent: selectedStock.changePercent ?? 0,
      transactions: [transaction],
    }, {
      price: selectedStock.currentPrice,
      changePercent: selectedStock.changePercent,
      changeAbs: selectedStock.changeAbs,
    });

    setHoldings(prev => [holding, ...prev]);
    toast.success(`${upperSymbol} added to portfolio`);
    setAddDialogOpen(false);
    resetForm();
  };

  const handleUpdateHolding = () => {
    if (!selectedHolding) return;

    const shares = parseFloat(formShares) || selectedHolding.shares;
    const avgCost = parseFloat(formAvgCost) || selectedHolding.avgCost;
    if (shares <= 0 || avgCost <= 0) {
      toast.error('Invalid values');
      return;
    }

    setHoldings(prev => prev.map(h => h.id === selectedHolding.id
      ? enrichHolding({
          ...h,
          shares: Math.round(shares),
          avgCost,
          purchaseDate: new Date(formPurchaseDate).toISOString(),
        })
      : h
    ));
    toast.success(`${selectedHolding.symbol} updated`);
    setEditDialogOpen(false);
    setSelectedHolding(null);
    resetForm();
  };

  const handleDeleteHolding = () => {
    if (!selectedHolding) return;

    setHoldings(prev => prev.filter(h => h.id !== selectedHolding.id));
    toast.success(`${selectedHolding.symbol} removed from portfolio`);
    setDeleteDialogOpen(false);
    setSelectedHolding(null);
  };

  const handleAddTransaction = () => {
    if (!selectedHolding || !formTxShares || !formTxPrice || !formTxDate) return;

    const shares = Math.round(parseFloat(formTxShares));
    const price = parseFloat(formTxPrice);
    if (isNaN(shares) || isNaN(price) || shares <= 0 || price <= 0) {
      toast.error('Invalid transaction values');
      return;
    }
    if (formTxType === 'SELL' && shares > selectedHolding.shares) {
      toast.error(`Insufficient shares. You hold ${selectedHolding.shares} but tried to sell ${shares}`);
      return;
    }

    const transaction: Transaction = {
      id: createId(),
      holdingId: selectedHolding.id,
      type: formTxType,
      shares,
      price,
      total: shares * price,
      date: new Date(formTxDate).toISOString(),
      notes: formTxNotes || null,
      createdAt: new Date().toISOString(),
    };

    setHoldings(prev => prev.map(h => {
      if (h.id !== selectedHolding.id) return h;
      const nextShares = formTxType === 'BUY' ? h.shares + shares : h.shares - shares;
      const nextAvgCost = formTxType === 'BUY'
        ? ((h.shares * h.avgCost) + transaction.total) / nextShares
        : h.avgCost;
      return enrichHolding({
        ...h,
        shares: nextShares,
        avgCost: nextAvgCost,
        transactions: [transaction, ...h.transactions],
      });
    }));
    toast.success(`${formTxType} order recorded for ${selectedHolding.symbol}`);
    setTxDialogOpen(false);
    setSelectedHolding(null);
    resetTxForm();
  };

  // ── Transaction Helpers ──────────────────────────────────────

  const fetchTransactions = useCallback((holdingId: string) => {
    const holding = holdings.find(h => h.id === holdingId);
    setTransactions(holding?.transactions ?? []);
  }, [holdings]);

  const openEditDialog = (holding: Holding) => {
    setSelectedHolding(holding);
    setFormShares(String(holding.shares));
    setFormAvgCost(String(holding.avgCost));
    setFormPurchaseDate(format(new Date(holding.purchaseDate), 'yyyy-MM-dd'));
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (holding: Holding) => {
    setSelectedHolding(holding);
    setDeleteDialogOpen(true);
  };

  const openTxDialog = async (holding: Holding) => {
    setSelectedHolding(holding);
    await fetchTransactions(holding.id);
    setTxDialogOpen(true);
  };

  // ── Form Resets ──────────────────────────────────────────────

  const resetForm = () => {
    setSelectedStock(null);
    setFormShares('');
    setFormAvgCost('');
    setFormPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setSearchQuery('');
  };

  const resetTxForm = () => {
    setFormTxType('BUY');
    setFormTxShares('');
    setFormTxPrice('');
    setFormTxDate(format(new Date(), 'yyyy-MM-dd'));
    setFormTxNotes('');
  };

  return {
    // Profile
    profile,
    hydrated,
    loginName,
    setLoginName,
    loginPin,
    setLoginPin,
    loginError,
    setLoginError,
    handlePortfolioLogin,
    logoutProfile,

    // Holdings
    holdings,
    setHoldings,
    transactions,

    // Sort
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
    selectedHolding,
    setSelectedHolding,

    // Form
    searchQuery,
    setSearchQuery,
    selectedStock,
    setSelectedStock,
    formShares,
    setFormShares,
    formAvgCost,
    setFormAvgCost,
    formPurchaseDate,
    setFormPurchaseDate,
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

    // Actions
    handleAddHolding,
    handleUpdateHolding,
    handleDeleteHolding,
    handleAddTransaction,
    fetchTransactions,
    openEditDialog,
    openDeleteDialog,
    openTxDialog,
    resetForm,
    resetTxForm,

    // Computed
    summary,
  };
}
