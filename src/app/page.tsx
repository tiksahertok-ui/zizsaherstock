'use client';

import { useState } from 'react';
import {
  CandlestickChart,
  Loader2,
  Plus,
  Briefcase,
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  Shield,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/components/ui/button';
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

// ── Auth Page ─────────────────────────────────────────────────

function AuthPage({ h }: { h: ReturnType<typeof useHoldings> }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (h.isRegisterMode) {
      if (h.loginPassword !== h.confirmPassword) {
        h.setLoginError('Passwords do not match');
        return;
      }
      if (h.loginPassword.length < 6) {
        h.setLoginError('Password must be at least 6 characters');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(h.loginEmail.trim())) {
        h.setLoginError('Please enter a valid email address');
        return;
      }
      h.handleRegister();
    } else {
      h.handleLogin();
    }
  };

  const switchMode = () => {
    h.setIsRegisterMode(!h.isRegisterMode);
    h.setLoginError('');
    setShowPassword(false);
    setShowConfirm(false);
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-background">
      {/* ── Left Panel: Branding ── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900" />
        
        {/* Animated grid pattern */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Floating shapes */}
        <motion.div
          className="absolute top-[15%] left-[10%] w-64 h-64 rounded-full bg-white/5 blur-2xl"
          animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[20%] right-[10%] w-80 h-80 rounded-full bg-white/5 blur-3xl"
          animate={{ y: [0, 15, 0], x: [0, -15, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-[50%] left-[50%] w-40 h-40 rounded-full bg-emerald-400/10 blur-2xl"
          animate={{ y: [0, -30, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <CandlestickChart className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-2xl text-white tracking-tight">
              EGX Portfolio
            </span>
          </motion.div>

          {/* Main heading */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-4">
              Track your
              <br />
              <span className="text-emerald-200">Egyptian market</span>
              <br />
              investments
            </h1>
            <p className="text-emerald-100/70 text-lg max-w-md leading-relaxed">
              Real-time portfolio tracking for EGX stocks, gold, and more. All your data saved securely.
            </p>
          </motion.div>

          {/* Feature pills */}
          <motion.div
            className="flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            {[
              { icon: TrendingUp, label: 'Live Market Data' },
              { icon: BarChart3, label: 'Portfolio Analytics' },
              { icon: Shield, label: 'Secure & Private' },
            ].map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-sm text-white/90"
              >
                <f.icon className="w-4 h-4 text-emerald-300" />
                {f.label}
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── Right Panel: Auth Form ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <motion.div
          className="w-full max-w-[420px]"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <CandlestickChart className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-xl tracking-tight">
              EGX <span className="text-emerald-600 dark:text-emerald-400">Portfolio</span>
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={h.isRegisterMode ? 'register' : 'login'}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
            >
              {/* Header text */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight">
                  {h.isRegisterMode ? 'Create your account' : 'Welcome back'}
                </h2>
                <p className="text-muted-foreground mt-1.5">
                  {h.isRegisterMode
                    ? 'Start tracking your Egyptian market portfolio'
                    : 'Sign in to access your portfolio'}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email field */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={h.loginEmail}
                      onChange={(e) => { h.setLoginEmail(e.target.value); h.setLoginError(''); }}
                      className="pl-10 h-11 bg-muted/40 border-border/60 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 transition-colors"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Password field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Password
                    </Label>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={h.isRegisterMode ? 'At least 6 characters' : 'Enter your password'}
                      value={h.loginPassword}
                      onChange={(e) => { h.setLoginPassword(e.target.value); h.setLoginError(''); }}
                      className="pl-10 pr-10 h-11 bg-muted/40 border-border/60 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 transition-colors"
                      autoComplete={h.isRegisterMode ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password (register only) */}
                <AnimatePresence>
                  {h.isRegisterMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <Label htmlFor="confirm" className="text-sm font-medium">
                        Confirm password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="confirm"
                          type={showConfirm ? 'text' : 'password'}
                          placeholder="Re-enter your password"
                          value={h.confirmPassword}
                          onChange={(e) => { h.setConfirmPassword(e.target.value); h.setLoginError(''); }}
                          className="pl-10 pr-10 h-11 bg-muted/40 border-border/60 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 transition-colors"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm(!showConfirm)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error message */}
                <AnimatePresence>
                  {h.loginError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive font-medium"
                    >
                      {h.loginError}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={h.authLoading}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all duration-200"
                >
                  {h.authLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {h.authLoading
                    ? 'Please wait...'
                    : h.isRegisterMode
                    ? 'Create Account'
                    : 'Sign In'}
                  {!h.authLoading && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </form>

              {/* Switch mode */}
              <div className="mt-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {h.isRegisterMode ? 'Already have an account?' : "Don't have an account?"}
                  {' '}
                  <button
                    type="button"
                    onClick={switchMode}
                    className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline underline-offset-2 transition-all"
                  >
                    {h.isRegisterMode ? 'Sign in' : 'Create account'}
                  </button>
                </p>
              </div>

              {/* Trust indicator */}
              <div className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
                <Shield className="w-3.5 h-3.5" />
                <span>Your data is encrypted and persists across sessions</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
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

// ── Main Page ─────────────────────────────────────────────────

export default function HomePage() {
  const h = useHoldings();
  const m = useMarketData(h.hydrated && h.authenticated, h.profile, h.holdings, h.setHoldings);

  if (!h.hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!h.authenticated || !h.profile) {
    return <AuthPage h={h} />;
  }

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