import re

with open('/home/z/my-project/src/app/analysis/page.tsx', 'r') as f:
    content = f.read()

# Find and replace the PriceTargetsBar component
start_marker = '  // ── Price Targets Panel ──'
end_marker = '  // ── Loading Skeleton ──'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print('ERROR: Could not find markers')
    print('Start:', start_idx, 'End:', end_idx)
    exit(1)

new_component = '''  // ── Price Targets Bar (Modern) ──
  const PriceTargetsBar = ({ s, compact = false }: { s: ScreenerStock; compact?: boolean }) => {
    const entry = s.entryPrice;
    const sl = s.stopLoss;
    const tps = s.takeProfits;

    const allPrices = [sl, entry, ...tps.map(tp => tp.price)].filter(p => p > 0);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const range = maxP - minP || 1;
    const pad = range * 0.1;
    const pos = (p: number) => ((p - minP + pad) / (range + pad * 2)) * 100;
    const entryPos = pos(entry);
    const slPos = pos(sl);

    if (compact) {
      return (
        <div className="relative">
          <div className="relative h-1.5 rounded-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/25 via-blue-500/10 to-emerald-500/25" />
          </div>
          <div className="relative -mt-1.5 h-1.5">
            <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild>
              <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 border border-background z-20" style={{ left: \`calc(\${slPos}% - 4px)\` }} />
            </TooltipTrigger><TooltipContent side="top" className="text-[10px] py-1"><span className="text-red-500 font-bold">وقف {sl.toFixed(2)}</span></TooltipContent></Tooltip></TooltipProvider>
            <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 border-[1.5px] border-background z-30 shadow-sm" style={{ left: \`calc(\${entryPos}% - 5px)\` }} />
            {tps.map((tp) => (
              <TooltipProvider key={tp.level} delayDuration={150}><Tooltip><TooltipTrigger asChild>
                <div className={[["absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-background z-20",
                  tp.probability === 'High' ? 'bg-emerald-400' : tp.probability === 'Medium' ? 'bg-amber-400' : 'bg-slate-400'].join(' ')} style={{ left: \`calc(\${pos(tp.price)}% - 4px)\` }} />
              </TooltipTrigger><TooltipContent side="top" className="text-[10px] py-1">
                <span className="font-bold">م{tp.level}: {tp.price.toFixed(2)}</span>
                <span className="text-muted-foreground mr-1">({((tp.price - entry) / entry * 100 >= 0 ? '+' : '')}{((tp.price - entry) / entry * 100).toFixed(1)}%)</span>
              </TooltipContent></Tooltip></TooltipProvider>
            ))}
          </div>
        </div>
      );
    }

    const probCfg: Record<string, { text: string; bg: string; border: string; accent: string; label: string }> = {
      High:   { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/[0.05]', border: 'border-emerald-500/20', accent: 'bg-emerald-500', label: 'مرتفع' },
      Medium: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/[0.05]', border: 'border-amber-500/20', accent: 'bg-amber-500', label: 'متوسط' },
      Low:    { text: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-500/[0.03]', border: 'border-slate-500/15', accent: 'bg-slate-400', label: 'منخفض' },
    };
    const rrColor = s.riskReward >= 2 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : s.riskReward >= 1 ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
      : s.riskReward > 0 ? 'text-red-500 bg-red-500/10 border-red-500/20'
      : 'text-muted-foreground bg-muted/50 border-border/30';
    const tp1Pct = tps[0] ? ((tps[0].price - entry) / entry * 100) : 0;

    return (
      <div className="space-y-3">
        <div className="relative">
          <div className="relative h-8 rounded-lg overflow-hidden bg-muted/20 border border-border/30">
            <div className="absolute inset-y-0 left-0 bg-red-500/[0.08]" style={{ width: entryPos + '%' }} />
            <div className="absolute inset-y-0 bg-emerald-500/[0.08]" style={{ left: entryPos + '%' }} />
            <div className="absolute inset-y-0 w-px bg-blue-500 z-20" style={{ left: entryPos + '%' }} />
            <div className="absolute inset-y-0 w-px bg-red-500/40 z-10" style={{ left: slPos + '%' }} />
            {tps.map(tp => <div key={tp.level} className={[["absolute inset-y-0 w-px z-10",
              tp.probability === 'High' ? 'bg-emerald-500/50' : tp.probability === 'Medium' ? 'bg-amber-500/30' : 'bg-slate-400/20'].join(' ')} style={{ left: pos(tp.price) + '%' }} />)}
            {[0.25, 0.5, 0.75].map(p => <div key={p} className="absolute inset-y-0 w-px bg-border/10" style={{ left: (p * 100) + '%' }} />)}
          </div>
          <div className="relative h-5 -mt-8 pointer-events-none">
            <div className="absolute top-0 z-30 pointer-events-auto" style={{ left: slPos + '%', transform: 'translateX(-50%)' }}>
              <span className="text-[8px] font-bold text-red-500 bg-red-500/10 border border-red-500/15 px-1 py-px rounded">{sl.toFixed(2)}</span>
            </div>
            <div className="absolute top-0 z-30 pointer-events-auto" style={{ left: entryPos + '%', transform: 'translateX(-50%)' }}>
              <span className="text-[8px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1 py-px rounded">{entry.toFixed(2)}</span>
            </div>
            {tps.map((tp, idx) => {
              const cfg = probCfg[tp.probability] || probCfg.Low;
              return (
                <div key={tp.level} className={["absolute z-30 pointer-events-auto", idx === 0 ? 'top-0' : 'bottom-0'].join(' ')} style={{ left: pos(tp.price) + '%', transform: 'translateX(-50%)' }}>
                  <span className={["text-[8px] font-bold border px-1 py-px rounded whitespace-nowrap", cfg.text, cfg.bg, cfg.border].join(' ')}>{tp.price.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          <div className="rounded-lg border border-red-500/15 bg-red-500/[0.03] p-2 text-center">
            <Shield className="w-3.5 h-3.5 text-red-500 mx-auto mb-1" />
            <div className="text-[8px] font-semibold text-red-500/60 uppercase tracking-wider">وقف</div>
            <div className="text-[13px] font-bold font-mono text-red-500 mt-0.5">{sl.toFixed(2)}</div>
            <div className="text-[9px] text-red-500/50 font-medium mt-0.5">-{s.stopLossPct.toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-2 text-center">
            <Target className="w-3.5 h-3.5 text-blue-500 mx-auto mb-1" />
            <div className="text-[8px] font-semibold text-blue-500/60 uppercase tracking-wider">دخول</div>
            <div className="text-[13px] font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">{entry.toFixed(2)}</div>
            <div className="text-[9px] text-muted-foreground/40 mt-0.5">ج.م</div>
          </div>
          {tps.map(tp => {
            const cfg = probCfg[tp.probability] || probCfg.Low;
            const gain = ((tp.price - entry) / entry * 100);
            return (
              <div key={tp.level} className={["rounded-lg border p-2 text-center", cfg.border, cfg.bg].join(' ')}>
                <Crosshair className={["w-3.5 h-3.5 mx-auto mb-1", cfg.text].join(' ')} />
                <div className="text-[8px] font-semibold text-muted-foreground/60 uppercase tracking-wider">مستهدف {tp.level}</div>
                <div className={["text-[13px] font-bold font-mono mt-0.5", cfg.text].join(' ')}>{tp.price.toFixed(2)}</div>
                <div className={["text-[9px] font-medium mt-0.5 flex items-center justify-center gap-0.5", gain >= 0 ? 'text-emerald-600' : 'text-red-500'].join(' ')}>
                  {gain >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                  {gain >= 0 ? '+' : ''}{gain.toFixed(1)}%
                </div>
                <div className="text-[7px] text-muted-foreground/40 mt-0.5 truncate" title={tp.basis}>{tp.basis}</div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>المخاطرة: <span className="font-mono font-bold text-foreground">{Math.abs(s.stopLossPct).toFixed(1)}%</span></span>
            <span className="text-border/30">|</span>
            <span>العائد: <span className={["font-mono font-bold", tp1Pct >= 0 ? 'text-emerald-600' : 'text-red-500'].join(' ')}>{tp1Pct >= 0 ? '+' : ''}{tp1Pct.toFixed(1)}%</span></span>
          </div>
          <div className={["flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border", rrColor].join(' ')}>
            <Gauge className="w-2.5 h-2.5" />
            R:R {s.riskReward > 0 ? s.riskReward.toFixed(1) : 'N/A'}:1
          </div>
        </div>
      </div>
    );
  };

'''

new_content = content[:start_idx] + new_component + '\n' + content[end_idx:]

with open('/home/z/my-project/src/app/analysis/page.tsx', 'w') as f:
    f.write(new_content)

print('SUCCESS: PriceTargetsBar replaced')
