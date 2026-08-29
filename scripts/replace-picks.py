import re

with open('/home/z/my-project/src/app/analysis/page.tsx', 'r') as f:
    lines = f.readlines()

# Find start and end of daily picks section
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if 'DAILY PICKS' in line and '═' in line:
        start_idx = i
    if 'STATS + DISTRIBUTION' in line and '═' in line:
        end_idx = i

if start_idx is None or end_idx is None:
    print(f'ERROR: start={start_idx} end={end_idx}')
    exit(1)

new_section = '''        {/* ═══ DAILY PICKS ═══ */}
        {dailyPicks.length > 0 && !loading && (
          <motion.section {...fadeInUp} transition={{ duration: 0.4 }}>
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              {/* Header */}
              <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between border-b border-border/40">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <Flame className="w-4 h-4 text-white" />
                    </div>
                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-card animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold tracking-tight">توصيات اليوم</h2>
                      {lastUpdated && <span className="text-[10px] text-muted-foreground">{new Date(lastUpdated).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">كل الإشارات الفعالة مرتبة حسب القوة والثقة</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {dailyBuyPicks.length > 0 && (
                    <Badge className="text-[9px] bg-emerald-500 text-white border-emerald-500 h-5 rounded-md px-2 font-bold gap-1">
                      <TrendingUp className="w-2.5 h-2.5" />{dailyBuyPicks.length} شراء
                    </Badge>
                  )}
                  {dailySellPicks.length > 0 && (
                    <Badge className="text-[9px] bg-red-500 text-white border-red-500 h-5 rounded-md px-2 font-bold gap-1">
                      <TrendingDown className="w-2.5 h-2.5" />{dailySellPicks.length} بيع
                    </Badge>
                  )}
                </div>
              </div>

              {/* Buy Picks */
              {dailyBuyPicks.length > 0 && (
                <div className="px-4 sm:px-5 pt-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">فرص الشراء</span>
                    <span className="text-[10px] text-muted-foreground">({dailyBuyPicks.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {dailyBuyPicks.map((s, i) => {
                      const isStrong = s.signal === 'Strong Buy';
                      const isTop = i === 0 && isStrong;
                      const tp1 = s.takeProfits[0];
                      const tp1Pct = tp1 ? ((tp1.price - s.entryPrice) / s.entryPrice * 100) : 0;
                      const rrColor = s.riskReward >= 2 ? 'text-emerald-600' : s.riskReward >= 1 ? 'text-amber-500' : 'text-red-500';
                      const rrBg = s.riskReward >= 2 ? 'bg-emerald-500/10' : s.riskReward >= 1 ? 'bg-amber-500/10' : 'bg-red-500/10';
                      return (
                        <motion.div
                          key={s.symbol}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.25 }}
                          className={["rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer group",
                            isTop
                              ? 'border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.06] to-card hover:shadow-lg hover:shadow-emerald-500/5 ring-1 ring-emerald-500/10'
                              : isStrong
                                ? 'border-emerald-500/15 bg-card hover:border-emerald-500/30 hover:shadow-md'
                                : 'border-border/40 bg-card hover:border-emerald-400/20 hover:shadow-sm'
                          ].join(' ')}
                          onClick={() => { setViewMode('table'); setTimeout(() => {
                            const el = document.getElementById('row-' + s.symbol);
                            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setExpandedRow(s.symbol); }
                          }, 50); }}
                        >
                          <div className={["h-0.5",
                            isTop ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600' :
                            isStrong ? 'bg-emerald-500/60' : 'bg-emerald-400/30'
                          ].join(' ')} />

                          <div className="p-3 space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {isTop && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
                                  <span className="font-bold text-sm">{s.symbol}</span>
                                  <SignalBadge signal={s.signal} size="sm" />
                                </div>
                                <p className="text-[9px] text-muted-foreground truncate mt-0.5">{s.name}</p>
                              </div>
                              <ConfidenceRing value={s.confidence} size={36} />
                            </div>

                            <div className="grid grid-cols-3 gap-1.5">
                              <div className="rounded-md bg-blue-500/[0.05] border border-blue-500/10 px-2 py-1.5 text-center">
                                <div className="text-[7px] font-semibold text-blue-500/60 uppercase">الدخول</div>
                                <div className="text-[11px] font-bold font-mono text-blue-600 dark:text-blue-400">{s.entryPrice.toFixed(2)}</div>
                              </div>
                              <div className="rounded-md bg-red-500/[0.05] border border-red-500/10 px-2 py-1.5 text-center">
                                <div className="text-[7px] font-semibold text-red-500/60 uppercase">وقف</div>
                                <div className="text-[11px] font-bold font-mono text-red-500">{s.stopLoss.toFixed(2)}</div>
                                <div className="text-[7px] text-red-500/40">-{s.stopLossPct.toFixed(1)}%</div>
                              </div>
                              <div className="rounded-md bg-emerald-500/[0.05] border border-emerald-500/10 px-2 py-1.5 text-center">
                                <div className="text-[7px] font-semibold text-emerald-500/60 uppercase">مستهدف 1</div>
                                <div className="text-[11px] font-bold font-mono text-emerald-600 dark:text-emerald-400">{tp1 ? tp1.price.toFixed(2) : '—'}</div>
                                <div className="text-[7px] text-emerald-500/50 flex items-center justify-center gap-0.5">
                                  <ArrowUpRight className="w-2 h-2" />+{tp1Pct.toFixed(1)}%
                                </div>
                              </div>
                            </div>

                            <PriceTargetsBar s={s} compact />

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-[9px]">
                                <div className={["flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold", rrColor, rrBg].join(' ')}>
                                  <Gauge className="w-2 h-2" />{s.riskReward.toFixed(1)}:1
                                </div>
                                <span className="text-muted-foreground">RSI <span className={s.indicators.rsi > 70 ? 'text-red-500' : s.indicators.rsi < 30 ? 'text-emerald-500' : 'font-semibold text-foreground'}>{s.indicators.rsi.toFixed(0)}</span></span>
                              </div>
                              <span className="text-[9px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex items-center gap-0.5">التفاصيل <ChevronRight className="w-2.5 h-2.5" /></span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sell Picks */
              {dailySellPicks.length > 0 && (
                <div className="px-4 sm:px-5 pt-3 pb-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[11px] font-bold text-red-600 dark:text-red-400">فرص البيع</span>
                    <span className="text-[10px] text-muted-foreground">({dailySellPicks.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {dailySellPicks.map((s, i) => {
                      const isStrong = s.signal === 'Strong Sell';
                      const tp1 = s.takeProfits[0];
                      const tp1Pct = tp1 ? ((tp1.price - s.entryPrice) / s.entryPrice * 100) : 0;
                      const rrColor = s.riskReward >= 2 ? 'text-emerald-600' : s.riskReward >= 1 ? 'text-amber-500' : 'text-red-500';
                      const rrBg = s.riskReward >= 2 ? 'bg-emerald-500/10' : s.riskReward >= 1 ? 'bg-amber-500/10' : 'bg-red-500/10';
                      return (
                        <motion.div
                          key={s.symbol}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: (dailyBuyPicks.length + i) * 0.03, duration: 0.25 }}
                          className={["rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer group",
                            isStrong
                              ? 'border-red-500/25 bg-gradient-to-b from-red-500/[0.06] to-card hover:shadow-lg hover:shadow-red-500/5 ring-1 ring-red-500/10'
                              : 'border-red-500/15 bg-card hover:border-red-500/30 hover:shadow-md'
                          ].join(' ')}
                          onClick={() => { setViewMode('table'); setTimeout(() => {
                            const el = document.getElementById('row-' + s.symbol);
                            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setExpandedRow(s.symbol); }
                          }, 50); }}
                        >
                          <div className={isStrong ? 'h-0.5 bg-gradient-to-r from-red-400 via-red-500 to-red-600' : 'h-0.5 bg-red-500/40'} />
                          <div className="p-3 space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-sm">{s.symbol}</span>
                                  <SignalBadge signal={s.signal} size="sm" />
                                </div>
                                <p className="text-[9px] text-muted-foreground truncate mt-0.5">{s.name}</p>
                              </div>
                              <ConfidenceRing value={s.confidence} size={36} />
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <div className="rounded-md bg-blue-500/[0.05] border border-blue-500/10 px-2 py-1.5 text-center">
                                <div className="text-[7px] font-semibold text-blue-500/60 uppercase">الدخول</div>
                                <div className="text-[11px] font-bold font-mono text-blue-600 dark:text-blue-400">{s.entryPrice.toFixed(2)}</div>
                              </div>
                              <div className="rounded-md bg-red-500/[0.05] border border-red-500/10 px-2 py-1.5 text-center">
                                <div className="text-[7px] font-semibold text-red-500/60 uppercase">وقف</div>
                                <div className="text-[11px] font-bold font-mono text-red-500">{s.stopLoss.toFixed(2)}</div>
                                <div className="text-[7px] text-red-500/40">+{s.stopLossPct.toFixed(1)}%</div>
                              </div>
                              <div className="rounded-md bg-red-500/[0.05] border border-red-500/10 px-2 py-1.5 text-center">
                                <div className="text-[7px] font-semibold text-red-500/60 uppercase">مستهدف 1</div>
                                <div className="text-[11px] font-bold font-mono text-red-500">{tp1 ? tp1.price.toFixed(2) : '—'}</div>
                                <div className="text-[7px] text-red-500/50 flex items-center justify-center gap-0.5">
                                  <ArrowDownRight className="w-2 h-2" />{tp1Pct.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                            <PriceTargetsBar s={s} compact />
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-[9px]">
                                <div className={["flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold", rrColor, rrBg].join(' ')}>
                                  <Gauge className="w-2 h-2" />{s.riskReward.toFixed(1)}:1
                                </div>
                                <span className="text-muted-foreground">RSI <span className={s.indicators.rsi < 30 ? 'text-emerald-500' : s.indicators.rsi > 70 ? 'text-red-500' : 'font-semibold text-foreground'}>{s.indicators.rsi.toFixed(0)}</span></span>
                              </div>
                              <span className="text-[9px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex items-center gap-0.5">التفاصيل <ChevronRight className="w-2.5 h-2.5" /></span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */
              {dailyPicks.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <p className="text-xs text-muted-foreground">لا توجد إشارات كافية في الوقت الحالي</p>
                </div>
              )}
            </div>
          </motion.section>
        )}
'''

new_lines = lines[:start_idx] + new_section.split('\n') + ['\n'] + lines[end_idx:]

with open('/home/z/my-project/src/app/analysis/page.tsx', 'w') as f:
    f.writelines(new_lines)

print('SUCCESS: Daily picks section replaced')
