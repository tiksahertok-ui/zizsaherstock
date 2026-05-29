'use client';

import { ArrowLeftRight, ShoppingCart, TrendingDown } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

import { fmtCurrency } from '@/utils/formatters';
import type { Holding, Transaction } from '@/types';

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | null;
  transactions: Transaction[];
  formTxType: 'BUY' | 'SELL';
  onTxTypeChange: (v: 'BUY' | 'SELL') => void;
  formTxShares: string;
  onTxSharesChange: (v: string) => void;
  formTxPrice: string;
  onTxPriceChange: (v: string) => void;
  formTxDate: string;
  onTxDateChange: (v: string) => void;
  formTxNotes: string;
  onTxNotesChange: (v: string) => void;
  onSubmit: () => void;
}

export function TransactionDialog({
  open,
  onOpenChange,
  holding,
  transactions,
  formTxType,
  onTxTypeChange,
  formTxShares,
  onTxSharesChange,
  formTxPrice,
  onTxPriceChange,
  formTxDate,
  onTxDateChange,
  formTxNotes,
  onTxNotesChange,
  onSubmit,
}: TransactionDialogProps) {
  if (!holding) return null;

  const txShares = parseFloat(formTxShares) || 0;
  const txPrice = parseFloat(formTxPrice) || 0;
  const total = txShares * txPrice;
  const isValid = formTxShares && formTxPrice && formTxDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
            Buy / Sell — {holding.symbol}
          </DialogTitle>
          <DialogDescription>
            Record a transaction for <span className="font-semibold">{holding.symbol}</span>. You currently hold {holding.shares} shares.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-200px)] pr-1">
          {/* Type Selector */}
          <div className="flex gap-2">
            <Button
              variant={formTxType === 'BUY' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTxTypeChange('BUY')}
              className={formTxType === 'BUY' ? 'flex-1 bg-emerald-600 hover:bg-emerald-700' : 'flex-1'}
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
              BUY
            </Button>
            <Button
              variant={formTxType === 'SELL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTxTypeChange('SELL')}
              className={formTxType === 'SELL' ? 'flex-1 bg-red-600 hover:bg-red-700' : 'flex-1'}
            >
              <TrendingDown className="w-3.5 h-3.5 mr-1.5" />
              SELL
            </Button>
          </div>

          {/* Warning for SELL */}
          {formTxType === 'SELL' && txShares > holding.shares && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400">
              Insufficient shares. You hold <strong>{holding.shares}</strong> but tried to sell <strong>{txShares}</strong>.
            </div>
          )}

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Shares {formTxType === 'SELL' && <span className="text-muted-foreground">(max: {holding.shares})</span>}
              </Label>
              <Input
                type="number"
                placeholder="0"
                value={formTxShares}
                onChange={(e) => onTxSharesChange(e.target.value)}
                min={1}
                max={formTxType === 'SELL' ? holding.shares : undefined}
                step={1}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Price per Share (EGP)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={formTxPrice}
                onChange={(e) => onTxPriceChange(e.target.value)}
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Transaction Date</Label>
            <Input
              type="date"
              value={formTxDate}
              onChange={(e) => onTxDateChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              placeholder="Add a note about this transaction..."
              value={formTxNotes}
              onChange={(e) => onTxNotesChange(e.target.value)}
              rows={2}
            />
          </div>

          {/* Total preview */}
          {total > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {formTxType} {txShares} shares × {fmtCurrency(txPrice)}
              </span>
              <span className="text-sm font-bold">{fmtCurrency(total)}</span>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={onSubmit}
            disabled={!isValid || (formTxType === 'SELL' && txShares > holding.shares)}
            className={`w-full ${
              formTxType === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4 mr-2" />
            Record {formTxType} Order
          </Button>

          {/* Recent transactions */}
          {transactions.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recent Transactions ({transactions.length})
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {transactions.slice(0, 10).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-[10px] rounded-md bg-muted/30 p-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-bold px-1 py-0 ${
                          tx.type === 'BUY'
                            ? 'border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400'
                            : 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {tx.type}
                      </Badge>
                      <span className="font-semibold">{tx.shares} @ {fmtCurrency(tx.price)}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">{fmtCurrency(tx.total)}</span>
                      <p className="text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
