'use client';

import {
  CandlestickChart,
  Plus,
  Briefcase,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

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
  const m = useMarketData(h.hydrated, h.profile, h.holdings, h.setHoldings);

  if (!h.hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CandlestickChart className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
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