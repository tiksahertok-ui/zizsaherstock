'use client';

import { AlertTriangle, Trash2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { fmtCurrency, pnlColor } from '@/utils/formatters';
import type { Holding } from '@/types';

interface DeleteHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | null;
  onConfirm: () => void;
}

export function DeleteHoldingDialog({
  open,
  onOpenChange,
  holding,
  onConfirm,
}: DeleteHoldingDialogProps) {
  if (!holding) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Remove Position
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. All transaction history for this position will be lost.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Holding summary */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{holding.symbol}</span>
              <span className="text-xs text-muted-foreground">{holding.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Shares</span>
                <p className="font-semibold">{holding.shares.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Market Value</span>
                <p className="font-semibold">{fmtCurrency(holding.marketValue)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Total P&L</span>
                <p className={`font-semibold ${pnlColor(holding.pnl)}`}>{fmtCurrency(holding.pnl)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">P&L %</span>
                <p className={`font-semibold ${pnlColor(holding.pnlPercent)}`}>
                  {holding.pnlPercent >= 0 ? '+' : ''}{holding.pnlPercent.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1" onClick={onConfirm}>
              <Trash2 className="w-4 h-4 mr-2" />
              Remove
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
