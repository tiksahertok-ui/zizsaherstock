'use client';

import { Pencil, Save } from 'lucide-react';

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

import type { Holding } from '@/types';

interface EditHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | null;
  formShares: string;
  onSharesChange: (v: string) => void;
  formAvgCost: string;
  onAvgCostChange: (v: string) => void;
  formPurchaseDate: string;
  onPurchaseDateChange: (v: string) => void;
  onSubmit: () => void;
}

export function EditHoldingDialog({
  open,
  onOpenChange,
  holding,
  formShares,
  onSharesChange,
  formAvgCost,
  onAvgCostChange,
  formPurchaseDate,
  onPurchaseDateChange,
  onSubmit,
}: EditHoldingDialogProps) {
  if (!holding) return null;

  const isValid = formShares && formAvgCost;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-emerald-600" />
            Edit Position
          </DialogTitle>
          <DialogDescription>
            Update details for <span className="font-semibold">{holding.symbol}</span> ({holding.name})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only symbol */}
          <div className="space-y-1.5">
            <Label className="text-xs">Symbol</Label>
            <div className="px-3 py-2 rounded-md border bg-muted/50 text-sm font-bold">
              {holding.symbol}
            </div>
          </div>

          {/* Current price (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Current Price</Label>
            <div className="px-3 py-2 rounded-md border bg-muted/50 text-sm font-semibold">
              {holding.currentPrice.toFixed(2)} EGP
            </div>
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Shares</Label>
              <Input
                type="number"
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

          <Button
            onClick={onSubmit}
            disabled={!isValid}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
