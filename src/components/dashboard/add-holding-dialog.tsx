'use client';

import { useState, useMemo } from 'react';
import { Plus, Search, Check } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { StockOption } from '@/types';
import { fmtCurrency } from '@/utils/formatters';

interface AddHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableStocks: StockOption[];
  searchQuery: string;
  onSearchChange: (v: string) => void;
  selectedStock: StockOption | null;
  onSelectStock: (s: StockOption | null) => void;
  formShares: string;
  onSharesChange: (v: string) => void;
  formAvgCost: string;
  onAvgCostChange: (v: string) => void;
  formPurchaseDate: string;
  onPurchaseDateChange: (v: string) => void;
  onSubmit: () => void;
}

export function AddHoldingDialog({
  open,
  onOpenChange,
  availableStocks,
  searchQuery,
  onSearchChange,
  selectedStock,
  onSelectStock,
  formShares,
  onSharesChange,
  formAvgCost,
  onAvgCostChange,
  formPurchaseDate,
  onPurchaseDateChange,
  onSubmit,
}: AddHoldingDialogProps) {
  const filteredStocks = useMemo(() => {
    if (!searchQuery) return availableStocks.slice(0, 50);
    const q = searchQuery.toLowerCase();
    return availableStocks.filter(
      s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [availableStocks, searchQuery]);

  const isValid = selectedStock && formShares && formAvgCost;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" />
            Add New Position
          </DialogTitle>
          <DialogDescription>Search for a stock and add it to your portfolio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-180px)] pr-1">
          {/* Stock Search */}
          <div className="space-y-2">
            <Label className="text-xs">Search Stock</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by symbol or name..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
            {searchQuery && (
              <ScrollArea className="h-48 border rounded-lg">
                <div className="p-1">
                  {filteredStocks.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2 text-center">No stocks found</p>
                  ) : (
                    filteredStocks.map((stock) => (
                      <button
                        key={stock.symbol}
                        onClick={() => {
                          onSelectStock(stock);
                          onSearchChange('');
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs hover:bg-muted/60 transition-colors ${
                          selectedStock?.symbol === stock.symbol ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{stock.symbol}</span>
                          <span className="text-muted-foreground truncate max-w-[180px]">{stock.name}</span>
                          {stock.sector && (
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">({stock.sector})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {stock.currentPrice && (
                            <span className="font-semibold text-xs">{fmtCurrency(stock.currentPrice)}</span>
                          )}
                          {selectedStock?.symbol === stock.symbol && (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Selected Stock Indicator */}
          {selectedStock && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-semibold">{selectedStock.symbol}</span>
              <span className="text-xs text-muted-foreground">— {selectedStock.name}</span>
            </div>
          )}

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Shares</Label>
              <Input
                type="number"
                placeholder="0"
                value={formShares}
                onChange={(e) => onSharesChange(e.target.value)}
                min={1}
                step={1}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Avg Cost (EGP)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={formAvgCost}
                onChange={(e) => onAvgCostChange(e.target.value)}
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Purchase Date</Label>
            <Input
              type="date"
              value={formPurchaseDate}
              onChange={(e) => onPurchaseDateChange(e.target.value)}
            />
          </div>

          {/* Submit */}
          <Button
            onClick={onSubmit}
            disabled={!isValid}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add to Portfolio
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
