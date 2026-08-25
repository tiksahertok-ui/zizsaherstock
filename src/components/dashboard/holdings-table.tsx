'use client';

import {
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Minus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowLeftRight,
  Eye,
} from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { fmtCurrency, fmtNumber, pnlColor, pnlBgColor, fmtPercent } from '@/utils/formatters';
import type { StoredHolding, Holding, SortField, SortDir } from '@/types';

interface HoldingsTableProps {
  sortedHoldings: StoredHolding[];
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  onEdit: (holding: Holding) => void;
  onDelete: (holding: Holding) => void;
  onTransaction: (holding: Holding) => void;
}

function SortableHeader({
  label,
  field,
  sortField,
  sortDir,
  onToggleSort,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onToggleSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wide"
      onClick={() => onToggleSort(field)}
    >
      {label}
      <ArrowUpDown className={`ml-1 h-3 w-3 ${active ? 'text-foreground' : 'text-muted-foreground/50'}`} />
    </Button>
  );
}

export function HoldingsTable({
  sortedHoldings,
  sortField,
  sortDir,
  toggleSort,
  onEdit,
  onDelete,
  onTransaction,
}: HoldingsTableProps) {
  if (sortedHoldings.length === 0) {
    return (
      <div className="rounded-xl border bg-card/60 p-8 text-center">
        <p className="text-muted-foreground text-sm">No holdings to display</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card/60 overflow-hidden">
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[50px] text-xs">#</TableHead>
              <TableHead className="text-xs">
                <SortableHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onToggleSort={toggleSort} />
              </TableHead>
              <TableHead className="text-xs hidden md:table-cell">Shares</TableHead>
              <TableHead className="text-xs">Avg Cost</TableHead>
              <TableHead className="text-xs">آخر إغلاق</TableHead>
              <TableHead className="text-xs">
                <SortableHeader label="Market Value" field="marketValue" sortField={sortField} sortDir={sortDir} onToggleSort={toggleSort} />
              </TableHead>
              <TableHead className="text-xs">
                <SortableHeader label="P&L %" field="pnlPercent" sortField={sortField} sortDir={sortDir} onToggleSort={toggleSort} />
              </TableHead>
              <TableHead className="text-xs hidden lg:table-cell">
                <SortableHeader label="P&L" field="pnl" sortField={sortField} sortDir={sortDir} onToggleSort={toggleSort} />
              </TableHead>
              <TableHead className="text-xs hidden xl:table-cell">
                <SortableHeader label="Today" field="dayChange" sortField={sortField} sortDir={sortDir} onToggleSort={toggleSort} />
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedHoldings.map((h, i) => (
              <TableRow key={h.id} className="group hover:bg-muted/30">
                <TableCell className="text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">{h.symbol}</span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{h.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs hidden md:table-cell">{fmtNumber(h.shares, 0)}</TableCell>
                <TableCell className="text-xs">{fmtCurrency(h.avgCost)}</TableCell>
                <TableCell className="text-xs font-semibold">{fmtCurrency(h.currentPrice)}</TableCell>
                <TableCell className="text-xs font-semibold">{fmtCurrency(h.marketValue)}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold px-1.5 py-0 ${pnlBgColor(h.pnlPercent)}`}
                  >
                    {h.pnlPercent > 0 && <TrendingUp className="w-2.5 h-2.5 mr-0.5" />}
                    {h.pnlPercent < 0 && <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
                    {h.pnlPercent === 0 && <Minus className="w-2.5 h-2.5 mr-0.5" />}
                    {fmtPercent(h.pnlPercent)}
                  </Badge>
                </TableCell>
                <TableCell className={`text-xs font-semibold hidden lg:table-cell ${pnlColor(h.pnl)}`}>
                  {fmtCurrency(h.pnl)}
                </TableCell>
                <TableCell className={`text-xs font-semibold hidden xl:table-cell ${pnlColor(h.dayChange)}`}>
                  {fmtCurrency(h.dayChange)}
                  {h.dayChangePercent !== 0 && (
                    <span className="ml-1 text-[10px]">({fmtPercent(h.dayChangePercent)})</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => onEdit(h)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTransaction(h)}>
                        <ArrowLeftRight className="h-3.5 w-3.5 mr-2" /> Buy / Sell
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(h)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
