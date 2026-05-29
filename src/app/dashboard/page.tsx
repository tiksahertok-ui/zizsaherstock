'use client';

import { useState } from 'react';
import {
  CandlestickChart,
  Loader2,
  Plus,
  Briefcase,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useHoldings } from '@/hooks/use-holdings';
import { useMarketData } from '@/hooks/use-market-data';

import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { SummaryCards } from '@/components/dashboard/summary-cards';
import { MarketTicker } from '@/components/dashboard/market-ticker';
import { HoldingsTable } from '@/components/dashboard/holdings-table';
import { PortfolioCharts } from '@/components/dashboard/portfolio-charts';
import { GoldPanel } from '@/components/dashboard/gold-panel';
import { TechnicalAnalysisPanel } from '@/components/dashboard/technical-analysis-panel';
import { AddHoldingDialog } from '@/components/dashboard/add-holding-dialog';
import { EditHoldingDialog } from '@/components/dashboard/edit-holding-dialog';
import { DeleteHoldingDialog } from '@/components/dashboard/delete-holding-dialog';
import { TransactionDialog } from '@/components/dashboard/transaction-dialog';

// ── Login Form ────────────────────────────────────────────────

function LoginForm({
  loginName,
  setLoginName,
  loginPin,
  setLoginPin,
  loginError,
  onLogin,
}: {
  loginName: string;
  setLoginName: (v: string) => void;
  loginPin: string;
  setLoginPin: (v: string) => void;
  loginError: string;
  onLogin: () => void;
}) {
  const [showPin, setShowPin] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <CandlestickChart className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-xl tracking-tight">
            EGX <span className="text-emerald-600 dark:text-emerald-400">Portfolio</span>
          </span>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-6 space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-bold">Unlock Your Portfolio</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your portfolio name and PIN to access your data
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Portfolio Name</Label>
                <Input
                  placeholder="e.g., My Portfolio"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">PIN Code</Label>
                <div className="relative">
                  <Input
                    type={showPin ? 'text' : 'password'}
                    placeholder="Enter PIN (4+ chars)"
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {loginError && (
              <p className="text-xs text-destructive font-medium">{loginError}</p>
            )}

            <Button
              onClick={onLogin}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Lock className="w-4 h-4 mr-2" />
              Unlock Portfolio
            </Button>

            <p className="text-[10px] text-muted-foreground text-center">
              Your data is stored locally in your browser. No server storage.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────

function EmptyState({ onAddPosition }: { onAddPosition: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
        <Briefcase className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No Holdings Yet</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
        Start building your portfolio by adding your first position. Track your EGX stocks, gold, and more.
      </p>
      <Button
        onClick={onAddPosition}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Your First Position
      </Button>
    </div>
  );
}

// ── Main Dashboard Page ──────────────────────────────────────

export default function DashboardPage() {
  const h = useHoldings();
  const m = useMarketData(h.hydrated, h.profile, h.holdings, h.setHoldings);

  // ── Not hydrated yet (loading) ──
  if (!h.hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  // ── Not logged in ──
  if (!h.profile) {
    return (
      <LoginForm
        loginName={h.loginName}
        setLoginName={h.setLoginName}
        loginPin={h.loginPin}
        setLoginPin={h.setLoginPin}
        loginError={h.loginError}
        onLogin={h.handlePortfolioLogin}
      />
    );
  }

  // ── Logged in — Dashboard ──
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <DashboardHeader
        profile={h.profile}
        onRefresh={() => m.fetchAll(true)}
        onAddPosition={() => h.setAddDialogOpen(true)}
        onLogout={h.logoutProfile}
        refreshing={m.refreshing}
      />

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 py-4 max-w-[1600px] mx-auto w-full space-y-4">
        {/* Market Ticker */}
        <MarketTicker
          indexData={m.indexData}
          extrasData={m.extrasData}
          goldEgpChanges={m.goldEgpChanges}
          usdEgpClientChange={m.usdEgpClientChange}
          marketStatus={m.extrasData?.marketStatus}
        />

        {/* Summary Cards */}
        {h.summary && <SummaryCards summary={h.summary} />}

        {/* Empty state or main content */}
        {h.holdings.length === 0 && !m.loading ? (
          <EmptyState onAddPosition={() => h.setAddDialogOpen(true)} />
        ) : (
          <>
            {/* Charts */}
            <PortfolioCharts
              holdings={h.holdings}
              perfData={m.perfData}
              indexData={m.indexData}
            />

            {/* Holdings Table */}
            <HoldingsTable
              sortedHoldings={h.sortedHoldings}
              sortField={h.sortField}
              sortDir={h.sortDir}
              toggleSort={h.toggleSort}
              onEdit={h.openEditDialog}
              onDelete={h.openDeleteDialog}
              onTransaction={h.openTxDialog}
            />

            {/* Bottom row: Gold + Technical Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <GoldPanel
                extrasData={m.extrasData}
                goldEgpChanges={m.goldEgpChanges}
              />
              <TechnicalAnalysisPanel
                taData={m.taData}
                holdings={h.holdings}
                taLoading={m.taLoading}
              />
            </div>
          </>
        )}
      </main>

      {/* Dialogs */}
      <AddHoldingDialog
        open={h.addDialogOpen}
        onOpenChange={h.setAddDialogOpen}
        availableStocks={m.availableStocks}
        searchQuery={h.searchQuery}
        onSearchChange={h.setSearchQuery}
        selectedStock={h.selectedStock}
        onSelectStock={h.setSelectedStock}
        formShares={h.formShares}
        onSharesChange={h.setFormShares}
        formAvgCost={h.formAvgCost}
        onAvgCostChange={h.setFormAvgCost}
        formPurchaseDate={h.formPurchaseDate}
        onPurchaseDateChange={h.setFormPurchaseDate}
        onSubmit={h.handleAddHolding}
      />

      <EditHoldingDialog
        open={h.editDialogOpen}
        onOpenChange={h.setEditDialogOpen}
        holding={h.selectedHolding}
        formShares={h.formShares}
        onSharesChange={h.setFormShares}
        formAvgCost={h.formAvgCost}
        onAvgCostChange={h.setFormAvgCost}
        formPurchaseDate={h.formPurchaseDate}
        onPurchaseDateChange={h.setFormPurchaseDate}
        onSubmit={h.handleUpdateHolding}
      />

      <DeleteHoldingDialog
        open={h.deleteDialogOpen}
        onOpenChange={h.setDeleteDialogOpen}
        holding={h.selectedHolding}
        onConfirm={h.handleDeleteHolding}
      />

      <TransactionDialog
        open={h.txDialogOpen}
        onOpenChange={h.setTxDialogOpen}
        holding={h.selectedHolding}
        transactions={h.transactions}
        formTxType={h.formTxType}
        onTxTypeChange={h.setFormTxType}
        formTxShares={h.formTxShares}
        onTxSharesChange={h.setFormTxShares}
        formTxPrice={h.formTxPrice}
        onTxPriceChange={h.setFormTxPrice}
        formTxDate={h.formTxDate}
        onTxDateChange={h.setFormTxDate}
        formTxNotes={h.formTxNotes}
        onTxNotesChange={h.setFormTxNotes}
        onSubmit={h.handleAddTransaction}
      />
    </div>
  );
}
