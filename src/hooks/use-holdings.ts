'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'

import type {
  Holding, Transaction, StoredHolding,
  StockOption, PortfolioSummary, SortField, SortDir,
} from '@/types'

// ── localStorage keys ──────────────────────────────────────────
const LS_KEY = 'egx_portfolio_holdings'

// ── Stored shape (matches old DbHolding) ───────────────────────
interface LsHolding {
  id: string
  symbol: string
  name: string
  shares: number
  avgCost: number
  purchaseDate: string
  createdAt: string
  updatedAt: string
  transactions: LsTransaction[]
}

interface LsTransaction {
  id: string
  holdingId: string
  type: string
  shares: number
  price: number
  total: number
  date: string
  notes: string | null
  createdAt: string
}

function toStoredHolding(db: LsHolding): StoredHolding {
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
  }
}

function loadFromLS(): LsHolding[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveToLS(holdings: LsHolding[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LS_KEY, JSON.stringify(holdings)) } catch { /* quota */ }
}

// ── Return type ───────────────────────────────────────────────
export interface UseHoldingsReturn {
  profile: { id: string; email: string } | null
  authenticated: boolean
  hydrated: boolean
  isRegisterMode: boolean; setIsRegisterMode: (v: boolean) => void
  loginEmail: string; setLoginEmail: (v: string) => void
  loginPassword: string; setLoginPassword: (v: string) => void
  confirmPassword: string; setConfirmPassword: (v: string) => void
  loginError: string; setLoginError: (v: string) => void
  authLoading: boolean
  handleLogin: () => void; handleRegister: () => void; handleLogout: () => void
  holdings: StoredHolding[]; setHoldings: React.Dispatch<React.SetStateAction<StoredHolding[]>>
  loading: boolean; fetchHoldings: () => Promise<void>
  sortField: SortField; sortDir: SortDir; sortedHoldings: StoredHolding[]; toggleSort: (field: SortField) => void
  addDialogOpen: boolean; setAddDialogOpen: (v: boolean) => void
  editDialogOpen: boolean; setEditDialogOpen: (v: boolean) => void
  deleteDialogOpen: boolean; setDeleteDialogOpen: (v: boolean) => void
  txDialogOpen: boolean; setTxDialogOpen: (v: boolean) => void
  selectedHolding: Holding | null; setSelectedHolding: (h: Holding | null) => void
  searchQuery: string; setSearchQuery: (v: string) => void
  selectedStock: StockOption | null; setSelectedStock: (s: StockOption | null) => void
  formShares: string; setFormShares: (v: string) => void
  formAvgCost: string; setFormAvgCost: (v: string) => void
  formPurchaseDate: string; setFormPurchaseDate: (v: string) => void
  formTxType: 'BUY' | 'SELL'; setFormTxType: (v: 'BUY' | 'SELL') => void
  formTxShares: string; setFormTxShares: (v: string) => void
  formTxPrice: string; setFormTxPrice: (v: string) => void
  formTxDate: string; setFormTxDate: (v: string) => void
  formTxNotes: string; setFormTxNotes: (v: string) => void
  handleAddHolding: () => void; handleUpdateHolding: () => void; handleDeleteHolding: () => void
  handleAddTransaction: () => void; fetchTransactions: (holdingId: string) => void
  openEditDialog: (holding: Holding) => void; openDeleteDialog: (holding: Holding) => void; openTxDialog: (holding: Holding) => void
  resetForm: () => void; resetTxForm: () => void
  summary: PortfolioSummary | null
}

// ── Hook ──────────────────────────────────────────────────────
export function useHoldings(): UseHoldingsReturn {
  const [hydrated, setHydrated] = useState(false)
  const [holdings, setHoldingsRaw] = useState<StoredHolding[]>([])
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState<SortField>('marketValue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [txDialogOpen, setTxDialogOpen] = useState(false)
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null)
  const [formShares, setFormShares] = useState('')
  const [formAvgCost, setFormAvgCost] = useState('')
  const [formPurchaseDate, setFormPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [formTxType, setFormTxType] = useState<'BUY' | 'SELL'>('BUY')
  const [formTxShares, setFormTxShares] = useState('')
  const [formTxPrice, setFormTxPrice] = useState('')
  const [formTxDate, setFormTxDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [formTxNotes, setFormTxNotes] = useState('')

  // ── Hydrate from localStorage on mount ──
  useEffect(() => {
    const loaded = loadFromLS().map(toStoredHolding)
    setHoldingsRaw(loaded)
    setHydrated(true)
  }, [])

  // ── Persist to localStorage whenever holdings change ──
  const setHoldings: React.Dispatch<React.SetStateAction<StoredHolding[]>> = useCallback((action) => {
    setHoldingsRaw((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      // Strip computed fields before saving
      const toSave: LsHolding[] = next.map((h) => ({
        id: h.id, symbol: h.symbol, name: h.name, shares: h.shares, avgCost: h.avgCost,
        purchaseDate: h.purchaseDate, createdAt: h.createdAt, updatedAt: h.updatedAt,
        transactions: h.transactions.map((t) => ({
          id: t.id, holdingId: t.holdingId, type: t.type, shares: t.shares,
          price: t.price, total: t.total, date: t.date, notes: t.notes, createdAt: t.createdAt,
        })),
      }))
      saveToLS(toSave)
      return next
    })
  }, [])

  // ── Fetch holdings (no-op, already in state) ──
  const fetchHoldings = useCallback(async () => { /* local */ }, [])

  // ── Sorting ─────────────────────────────────────────────────
  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break
        case 'marketValue': cmp = a.marketValue - b.marketValue; break
        case 'pnl': cmp = a.pnl - b.pnl; break
        case 'pnlPercent': cmp = a.pnlPercent - b.pnlPercent; break
        case 'dayChange': cmp = a.dayChange - b.dayChange; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [holdings, sortField, sortDir])

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => { setSortDir((d) => (prev === field ? (d === 'asc' ? 'desc' : 'asc') : 'desc')); return field })
  }, [])

  // ── Add holding ─────────────────────────────────────────────
  const handleAddHolding = useCallback(() => {
    if (!selectedStock) { toast.error('الرجاء اختيار سهم'); return }
    const shares = parseInt(formShares, 10); const avgCost = parseFloat(formAvgCost)
    if (!shares || shares <= 0 || !avgCost || avgCost <= 0) { toast.error('الرجاء إدخال عدد صحيح وسعر متوسط'); return }
    const purchaseDate = formPurchaseDate || format(new Date(), 'yyyy-MM-dd')
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const txId = crypto.randomUUID()

    const newHolding: StoredHolding = {
      id, symbol: selectedStock.symbol.trim().toUpperCase(), name: selectedStock.name.trim(),
      shares, avgCost, purchaseDate: new Date(purchaseDate).toISOString(),
      createdAt: now, updatedAt: now,
      currentPrice: avgCost, marketValue: shares * avgCost, costBasis: shares * avgCost,
      pnl: 0, pnlPercent: 0, dayChange: 0, dayChangePercent: 0,
      transactions: [{ id: txId, holdingId: id, type: 'BUY', shares, price: avgCost, total: shares * avgCost, date: new Date(purchaseDate).toISOString(), notes: null, createdAt: now }],
    }

    if (holdings.some((h) => h.symbol === newHolding.symbol)) {
      toast.error(`"${newHolding.symbol}" موجود بالفعل في المحفظة`)
      return
    }

    setHoldings((prev) => [newHolding, ...prev])
    setAddDialogOpen(false); resetForm()
    toast.success(`تمت إضافة ${selectedStock.symbol} إلى المحفظة`)
  }, [selectedStock, formShares, formAvgCost, formPurchaseDate, holdings, setHoldings])

  // ── Update holding ──────────────────────────────────────────
  const handleUpdateHolding = useCallback(() => {
    if (!selectedHolding) return
    const shares = parseInt(formShares, 10); const avgCost = parseFloat(formAvgCost)
    if (!shares || shares <= 0 || !avgCost || avgCost <= 0) { toast.error('الرجاء إدخال قيم صحيحة'); return }
    const purchaseDate = formPurchaseDate ? new Date(formPurchaseDate).toISOString() : selectedHolding.purchaseDate

    setHoldings((prev) => prev.map((h) => {
      if (h.id !== selectedHolding.id) return h
      const updated: StoredHolding = {
        ...h, shares, avgCost, purchaseDate, updatedAt: new Date().toISOString(),
        marketValue: shares * avgCost, costBasis: shares * avgCost,
      }
      return updated
    }))
    setEditDialogOpen(false); setSelectedHolding(null)
    toast.success(`تم تحديث ${selectedHolding.symbol}`)
  }, [selectedHolding, formShares, formAvgCost, formPurchaseDate, setHoldings])

  // ── Delete holding ──────────────────────────────────────────
  const handleDeleteHolding = useCallback(() => {
    if (!selectedHolding) return
    setHoldings((prev) => prev.filter((h) => h.id !== selectedHolding.id))
    setDeleteDialogOpen(false); setSelectedHolding(null)
    toast.success(`تم حذف ${selectedHolding.symbol}`)
  }, [selectedHolding, setHoldings])

  // ── Add transaction ─────────────────────────────────────────
  const handleAddTransaction = useCallback(() => {
    if (!selectedHolding) return
    const shares = parseInt(formTxShares, 10); const price = parseFloat(formTxPrice)
    if (!shares || shares <= 0 || !price || price <= 0) { toast.error('الرجاء إدخال قيم صحيحة'); return }
    if (!formTxDate) { toast.error('الرجاء إدخال تاريخ'); return }

    const total = shares * price
    const now = new Date().toISOString()
    const txDate = new Date(formTxDate).toISOString()
    const tx: Transaction = {
      id: crypto.randomUUID(), holdingId: selectedHolding.id, type: formTxType,
      shares, price, total, date: txDate, notes: formTxNotes.trim() || null, createdAt: now,
    }

    setHoldings((prev) => prev.map((h) => {
      if (h.id !== selectedHolding.id) return h
      const newTxs = [tx, ...h.transactions]
      let newShares = h.shares
      let newAvgCost = h.avgCost
      if (formTxType === 'BUY') {
        newShares = h.shares + shares
        newAvgCost = ((h.shares * h.avgCost) + total) / newShares
      } else {
        if (shares > h.shares) { toast.error(`عدد الأسهم غير كافٍ. تملك ${h.shares}`); return h }
        newShares = h.shares - shares
      }
      return {
        ...h, shares: newShares, avgCost: newAvgCost, transactions: newTxs,
        updatedAt: now, marketValue: newShares * newAvgCost, costBasis: newShares * newAvgCost,
      }
    }))
    setTxDialogOpen(false); setSelectedHolding(null); resetTxForm()
    toast.success(`${formTxType === 'BUY' ? 'شراء' : 'بيع'} ${shares} سهم من ${selectedHolding.symbol}`)
  }, [selectedHolding, formTxType, formTxShares, formTxPrice, formTxDate, formTxNotes, setHoldings])

  // ── Fetch single holding transactions (no-op, local) ───────
  const fetchTransactions = useCallback((_holdingId: string) => { /* local */ }, [])

  // ── Dialog openers ─────────────────────────────────────────
  const openEditDialog = useCallback((holding: Holding) => {
    setSelectedHolding(holding); setFormShares(String(holding.shares)); setFormAvgCost(String(holding.avgCost))
    setFormPurchaseDate(holding.purchaseDate ? format(new Date(holding.purchaseDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')); setEditDialogOpen(true)
  }, [])
  const openDeleteDialog = useCallback((holding: Holding) => { setSelectedHolding(holding); setDeleteDialogOpen(true) }, [])
  const openTxDialog = useCallback((holding: Holding) => {
    setSelectedHolding(holding); setFormTxType('BUY'); setFormTxShares(''); setFormTxPrice('')
    setFormTxDate(format(new Date(), 'yyyy-MM-dd')); setFormTxNotes(''); setTxDialogOpen(true)
  }, [])

  // ── Form resets ─────────────────────────────────────────────
  const resetForm = useCallback(() => { setSelectedStock(null); setFormShares(''); setFormAvgCost(''); setFormPurchaseDate(format(new Date(), 'yyyy-MM-dd')) }, [])
  const resetTxForm = useCallback(() => { setFormTxType('BUY'); setFormTxShares(''); setFormTxPrice(''); setFormTxDate(format(new Date(), 'yyyy-MM-dd')); setFormTxNotes('') }, [])

  // ── Summary ─────────────────────────────────────────────────
  const summary: PortfolioSummary = useMemo(() => {
    if (holdings.length === 0) return { totalInvestment: 0, totalMarketValue: 0, totalPnL: 0, totalPnLPercent: 0, todaysChange: 0, todaysChangePercent: 0, numberOfHoldings: 0, bestPerformer: null, worstPerformer: null }
    const totalInvestment = holdings.reduce((s, h) => s + h.costBasis, 0)
    const totalMarketValue = holdings.reduce((s, h) => s + h.marketValue, 0)
    const totalPnL = totalMarketValue - totalInvestment
    const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0
    const todaysChange = holdings.reduce((s, h) => s + h.dayChange, 0)
    const todaysChangePercent = totalMarketValue > 0 ? (todaysChange / (totalMarketValue - todaysChange)) * 100 : 0
    let best: PortfolioSummary['bestPerformer'] = null; let worst: PortfolioSummary['worstPerformer'] = null
    for (const h of holdings) {
      if (!best || h.pnlPercent > best.pnlPercent) best = { symbol: h.symbol, name: h.name, pnlPercent: h.pnlPercent, pnl: h.pnl }
      if (!worst || h.pnlPercent < worst.pnlPercent) worst = { symbol: h.symbol, name: h.name, pnlPercent: h.pnlPercent, pnl: h.pnl }
    }
    return { totalInvestment, totalMarketValue, totalPnL, totalPnLPercent, todaysChange, todaysChangePercent, numberOfHoldings: holdings.length, bestPerformer: best, worstPerformer: worst }
  }, [holdings])

  // ── No-op stubs for removed auth fields ────────────────────
  const noop = useCallback(() => {}, [])
  const noopStr = useCallback((_v: string) => {}, [])
  const noopBool = useCallback((_v: boolean) => {}, [])

  return {
    profile: { id: 'local', email: '' }, authenticated: true, hydrated,
    isRegisterMode: false, setIsRegisterMode: noopBool,
    loginEmail: '', setLoginEmail: noopStr,
    loginPassword: '', setLoginPassword: noopStr,
    confirmPassword: '', setConfirmPassword: noopStr,
    loginError: '', setLoginError: noopStr, authLoading: false,
    handleLogin: noop, handleRegister: noop, handleLogout: noop,
    holdings, setHoldings, loading, fetchHoldings,
    sortField, sortDir, sortedHoldings, toggleSort,
    addDialogOpen, setAddDialogOpen, editDialogOpen, setEditDialogOpen,
    deleteDialogOpen, setDeleteDialogOpen, txDialogOpen, setTxDialogOpen,
    selectedHolding, setSelectedHolding, searchQuery, setSearchQuery, selectedStock, setSelectedStock,
    formShares, setFormShares, formAvgCost, setFormAvgCost, formPurchaseDate, setFormPurchaseDate,
    formTxType, setFormTxType, formTxShares, setFormTxShares,
    formTxPrice, setFormTxPrice, formTxDate, setFormTxDate, formTxNotes, setFormTxNotes,
    handleAddHolding, handleUpdateHolding, handleDeleteHolding, handleAddTransaction, fetchTransactions,
    openEditDialog, openDeleteDialog, openTxDialog, resetForm, resetTxForm, summary,
  }
}
