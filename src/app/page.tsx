'use client';

import { useState } from 'react';
import {
  CandlestickChart,
  Loader2,
  Plus,
  Briefcase,
  Eye,
  EyeOff,
  UserPlus,
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

// ── Auth Form ─────────────────────────────────────────────────

function AuthForm({ h }: { h: ReturnType<typeof useHoldings> }) {
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (h.isRegisterMode) {
      if (h.loginPassword !== h.confirmPassword) {
        h.setLoginError('Passwords do not match');
        return;
      }
      if (h.loginPassword.length < 4) {
        h.setLoginError('Password must be at least 4 characters');
        return;
      }
      h.handleRegister();
    } else {
      h.handleLogin();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-emerald-50/30 dark:to-emerald-950/20">
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
              <h2 className="text-lg font-bold">
                {h.isRegisterMode ? 'Create Account' : 'Welcome Back'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {h.isRegisterMode
                  ? 'Create your account to track your portfolio'
                  : 'Sign in to access your portfolio'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Username</Label>
                <Input
                  placeholder="Enter your username"
                  value={h.loginUsername}
                  onChange={(e) => { h.setLoginUsername(e.target.value); h.setLoginError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  {h.isRegisterMode ? 'Password' : 'Password'}
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={h.isRegisterMode ? 'Choose a password (4+ chars)' : 'Enter your password'}
                    value={h.loginPassword}
                    onChange={(e) => { h.setLoginPassword(e.target.value); h.setLoginError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
                    className="pr-9"
                    autoComplete={h.isRegisterMode ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {h.isRegisterMode && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Confirm Password</Label>
                  <Input
                    type="password"
                    placeholder="Re-enter your password"
                    value={h.confirmPassword}
                    onChange={(e) => { h.setConfirmPassword(e.target.value); h.setLoginError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {h.loginError && (
                <p className="text-xs text-destructive font-medium">{h.loginError}</p>
              )}

              <Button
                type="submit"
                disabled={h.authLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {h.authLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : h.isRegisterMode ? (
                  <UserPlus className="w-4 h-4 mr-2" />
                ) : null}
                {h.authLoading
                  ? 'Please wait...'
                  : h.isRegisterMode
                  ? 'Create Account'
                  : 'Sign In'}
              </Button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { h.setIsRegisterMode(!h.isRegisterMode); h.setLoginError(''); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {h.isRegisterMode ? 'Already have an account? ' : "Don't have an account? "}
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {h.isRegisterMode ? 'Sign In' : 'Register'}
                </span>
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-[10px] text-muted-foreground text-center mt-4">
          Your data is saved securely and persists across sessions.
        </p>
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
        <Plus className="w-4 w-4 mr-2" />
        Add Your First Position
      </Button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function HomePage() {
  const h = useHoldings();
  const m = useMarketData(h.hydrated && h.authenticated, h.profile, h.holdings, h.setHoldings);

  // Not hydrated yet
  if (!h.hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Not authenticated — show auth form
  if (!h.authenticated || !h.profile) {
    return <AuthForm h={h} />;
  }

  // Authenticated — show dashboard
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <DashboardHeader
        profile={h.profile}
        onRefresh={() => m.fetchAll(true)}
        onAddPosition={() => h.setAddDialogOpen(true)}
        onLogout={h.handleLogout}
        refreshing={m.refreshing}
      />

      <main className="flex-1 px-4 sm:px-6 py-4 max-w-[1600px] mx-auto w-full space-y-4">
        <MarketTicker
          indexData={m.indexData}
          extrasData={m.extrasData}
          goldEgpChanges={m.goldEgpChanges}
          usdEgpClientChange={m.usdEgpClientChange}
          marketStatus={m.extrasData?.marketStatus}
        />

        {h.summary && <SummaryCards summary={h.summary} />}

        {h.holdings.length === 0 && !m.loading ? (
          <EmptyState onAddPosition={() => h.setAddDialogOpen(true)} />
        ) : (
          <>
            <PortfolioCharts
              holdings={h.holdings}
              perfData={m.perfData}
              indexData={m.indexData}
            />

            <HoldingsTable
              sortedHoldings={h.sortedHoldings}
              sortField={h.sortField}
              sortDir={h.sortDir}
              toggleSort={h.toggleSort}
              onEdit={h.openEditDialog}
              onDelete={h.openDeleteDialog}
              onTransaction={h.openTxDialog}
            />

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
        transactions={(h.holdings.find(x => x.id === h.selectedHolding?.id)?.transactions) ?? []}
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