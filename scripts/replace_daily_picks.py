import sys

with open('src/app/analysis/page.tsx', 'r') as f:
    content = f.read()

start_marker = '{/* ═══ DAILY PICKS ═══ */}'
end_marker = '{/* ═══ STATS + DISTRIBUTION ═══ */}'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print('ERROR: markers not found')
    sys.exit(1)

# The new section content
new_section = '''                {/* ═══ DAILY PICKS — FLAGSHIP v2 ═══ */}
        {!dailyPicksLoading && (
          <motion.section {...fadeInUp} transition={{ duration: 0.4 }}>
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              {/* ── Header ── */}
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
                      <h2 className="text-sm font-bold tracking-tight">اختيارات اليوم</h2>
                      {dailyPicksMeta?.generatedAt && <span className="text-[10px] text-muted-foreground">{new Date(dailyPicksMeta.generatedAt).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">بوابة جودة أساسية + محاذاة تقنية صعودية — ليست توصية مالية (A.6)</p>
                    {dailyPicksMeta?.countNote && dailyPicks.length > 0 && dailyPicks.length < 5 && (
                      <p className="text-[9px] text-amber-500 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" />{dailyPicksMeta.countNote}</p>
                    )}
                    {dailyPicksMeta?.diversity?.isConcentrated && (
                      <p className="text-[9px] text-amber-500 mt-0.5">تحذير تركز: {Object.entries(dailyPicksMeta.diversity.sectorDistribution)[0]?.[0]} ({Math.round(Object.entries(dailyPicksMeta.diversity.sectorDistribution)[0]?.[1] / dailyPicks.length * 100)}%)</p>
                    )}
                  </div>
                </div>
                {dailyPicks.length > 0 && (
                  <div className="flex items-center gap-2">
                    {dailyPicksMeta?.marketContext && (
                      <span className={"text-[8px] font-medium px-2 py-0.5 rounded-md border " + (dailyPicksMeta.marketContext.regime === 'bullish' ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' : dailyPicksMeta.marketContext.regime === 'bearish' ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'text-amber-600 bg-amber-500/10 border-amber-500/20')}>
                        EGX30 {dailyPicksMeta.marketContext.egx30ChangePct >= 0 ? '+' : ''}{dailyPicksMeta.marketContext.egx30ChangePct.toFixed(1)}%
                      </span>
                    )}
                    <span className="text-[8px] text-muted-foreground">{dailyPicksMeta.fundamentalPass} أساسي | {dailyPicksMeta.technicalPass} فني</span>
                    <Badge className="text-[9px] bg-emerald-500 text-white border-emerald-500 h-5 rounded-md px-2 font-bold gap-1">
                      <TrendingUp className="w-2.5 h-2.5" />{dailyPicks.length} اختيارات
                    </Badge>
                  </div>
                )}
              </div>

              {dailyPicks.length > 0 ? (
              <div className="px-4 sm:px-5 pt-4 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
                  {dailyPicks.map((s, i) => {
                    const isStrong = s.signal === 'Strong Buy';
                    const isTop = i === 0;
                    const tp1 = s.takeProfits[0]; const tp2 = s.takeProfits[1]; const tp3 = s.takeProfits[2];
                    const rrColor = s.riskReward >= 2 ? 'text-emerald-600' : s.riskReward >= 1 ? 'text-amber-500' : 'text-red-500';
                    const rrBg = s.riskReward >= 2 ? 'bg-emerald-500/10' : s.riskReward >= 1 ? 'bg-amber-500/10' : 'text-red-500';
                    const nss = s.nextSessionScore || 0;
                    const nssLabel = nss >= 75 ? 'قوية جداً' : nss >= 55 ? 'قوية' : 'متوسطة';
                    const nssColor = nss >= 75 ? 'text-emerald-600 bg-emerald-500/10' : nss >= 55 ? 'text-amber-600 bg-amber-500/10' : 'text-muted-foreground bg-muted';
                    const fg = s.fundamentalGate;
                    return (
                      <motion.div key={s.symbol} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}
                        className={['rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer group', isTop ? 'border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.06] to-card hover:shadow-lg hover:shadow-emerald-500/5 ring-1 ring-emerald-500/10' : isStrong ? 'border-emerald-500/15 bg-card hover:border-emerald-500/30 hover:shadow-md' : 'border-border/40 bg-card hover:border-emerald-400/20 hover:shadow-sm'].join(' ')}
                        onClick={() => { setViewMode('table'); setTimeout(() => { const el = document.getElementById('row-' + s.symbol); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setExpandedRow(s.symbol); } }, 50); }}
                      >
                        <div className={["h-0.5", isTop ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600' : isStrong ? 'bg-emerald-500/60' : 'bg-emerald-400/30'].join(' ')} />
                        <div className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={["text-[9px] font-bold w-4 h-4 rounded-md flex items-center justify-center shrink-0", isTop ? 'bg-amber-400 text-white' : 'bg-muted text-muted-foreground'].join(' ')}>{i + 1}</span>
                                <span className="font-bold text-sm">{s.symbol}</span>
                                <SignalBadge signal={s.signal} size="sm" />
                                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                  <CheckCircle className={"w-3 h-3 " + (fg?.passed ? 'text-emerald-500' : 'text-red-400')} />
                                </TooltipTrigger><TooltipContent side="top" className="text-[10px] max-w-[200px]">
                                  <div className="font-semibold mb-1">بوابة الجودة الأساسية</div>
                                  <div className="text-muted-foreground space-y-0.5">
                                    {fg?.checks && Object.entries(fg.checks).map(([k, v]: [string, any]) => (
                                      <div key={k} className="flex items-center gap-1">
                                        <span className={v.passed ? 'text-emerald-500' : 'text-red-400'}>{v.passed ? '\u2713' : '\u2717'}</span>
                                        <span>{v.detail}</span>
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent></Tooltip></TooltipProvider>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[9px] text-muted-foreground truncate">{s.name}</p>
                                <span className="text-[9px] font-mono font-semibold text-foreground/80 bg-muted/60 px-1 py-0 rounded">{s.indicators.close.toFixed(2)} ج.م</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <ConfidenceRing value={s.confidence} size={30} />
                              <span className={["text-[7px] font-bold px-1.5 py-0.5 rounded leading-none", nssColor].join(' ')}>{nss}%</span>
                            </div>
                          </div>
                          {s.topRationale && s.topRationale.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {s.topRationale.map((r, ri) => (
                                <span key={ri} className="text-[7px] font-medium text-emerald-600/80 dark:text-emerald-400/80 bg-emerald-500/[0.07] border border-emerald-500/10 px-1.5 py-0.5 rounded-md">{r}</span>
                              ))}
                            </div>
                          )}
                          <div className="rounded-lg bg-blue-500/[0.06] border border-blue-500/10 px-2.5 py-2">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <Target className="w-2.5 h-2.5 text-blue-500" />
                                <span className="text-[8px] font-semibold text-blue-500/70 uppercase">شراء حول</span>
                              </div>
                              {s.entryDetail?.discount > 0.1 && <span className="text-[7px] font-medium text-emerald-600 bg-emerald-500/10 px-1 py-0.5 rounded">-{s.entryDetail.discount.toFixed(1)}%</span>}
                            </div>
                            <div className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">{s.entryPrice.toFixed(2)} ج.م</div>
                            {s.entryDetail?.strategy && s.entryDetail.strategy !== 'شراء فوري' && (
                              <div className="mt-1 pt-1 border-t border-blue-500/10">
                                <div className="flex items-center gap-1"><Zap className="w-2.5 h-2.5 text-amber-500/70" /><span className="text-[8px] font-semibold text-amber-600/80 dark:text-amber-400/80">{s.entryDetail.strategy}</span></div>
                                <p className="text-[7px] text-muted-foreground/60 mt-0.5 mr-4 leading-relaxed">{s.entryDetail.basis}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between rounded-md bg-red-500/[0.05] border border-red-500/10 px-2 py-1.5">
                            <div className="flex items-center gap-1"><Shield className="w-2.5 h-2.5 text-red-500" /><span className="text-[8px] font-semibold text-red-500/70 uppercase">وقف خسارة</span></div>
                            <div className="text-[10px] font-bold font-mono text-red-500">{s.stopLoss.toFixed(2)}</div>
                          </div>
                          <div className="space-y-1">
                            {[tp1, tp2, tp3].map((tp, idx) => {
                              if (!tp) return null;
                              const pct = ((tp.price - s.entryPrice) / s.entryPrice * 100);
                              const colors = ['text-emerald-600 dark:text-emerald-400', 'text-blue-600 dark:text-blue-400', 'text-purple-600 dark:text-purple-400'];
                              const bgColors = ['bg-emerald-500/[0.05] border-emerald-500/10', 'bg-blue-500/[0.05] border-blue-500/10', 'bg-purple-500/[0.05] border-purple-500/10'];
                              const probLabels: Record<string, string> = { 'High': 'مرتفع', 'Medium': 'متوسط', 'Low': 'منخفض' };
                              const probColors: Record<string, string> = { 'High': 'text-emerald-600', 'Medium': 'text-amber-600', 'Low': 'text-muted-foreground' };
                              return (
                                <div key={idx} className={["flex items-center justify-between rounded-md border px-2 py-1", bgColors[idx]].join(' ')}>
                                  <div className="flex items-center gap-1.5">
                                    <Crosshair className={["w-2.5 h-2.5", colors[idx]].join(' ')} />
                                    <span className="text-[8px] font-semibold text-muted-foreground">TP{idx + 1}</span>
                                    <span className="text-[7px] text-muted-foreground/60">{tp.basis}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={["text-[7px] font-medium", probColors[tp.probability] || 'text-muted-foreground'].join(' ')}>{probLabels[tp.probability] || tp.probability}</span>
                                    <span className={["text-[10px] font-bold font-mono", colors[idx]].join(' ')}>{tp.price.toFixed(2)}</span>
                                    <span className={["text-[7px] font-medium", colors[idx]].join(' ')}>+{pct.toFixed(1)}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between pt-0.5">
                            <div className="flex items-center gap-1.5 text-[9px]">
                              <div className={["flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold", rrColor, rrBg].join(' ')}><Gauge className="w-2 h-2" />{s.riskReward.toFixed(1)}:1</div>
                              <span className="text-[7px] text-muted-foreground">{nssLabel}</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex items-center gap-0.5">التفاصيل <ChevronRight className="w-2.5 h-2.5" /></span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* B.4: Next-in-line */}
                {nextInLine.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border/30">
                    <button onClick={() => setShowNextInLine(!showNextInLine)} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full">
                      <ChevronDown className={["w-3 h-3 transition-transform ", showNextInLine ? 'rotate-180' : ''].join('')} />
                      <span className="font-medium">الترشيحات التالية (المراتب {dailyPicks.length + 1}–{dailyPicks.length + nextInLine.length})</span>
                      <span className="text-muted-foreground/60">— {nextInLine.length} أسهم قريبة</span>
                    </button>
                    <AnimatePresence>
                      {showNextInLine && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2.5">
                            {nextInLine.map((s) => (
                              <div key={s.symbol} className="flex items-center gap-2 rounded-lg border border-dashed border-border/40 px-2.5 py-2 opacity-60 hover:opacity-100 transition-opacity">
                                <span className="text-[9px] font-bold text-muted-foreground w-4 h-4 rounded bg-muted/50 flex items-center justify-center">{s.rank}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1"><span className="font-semibold text-[11px]">{s.symbol}</span><span className="text-[9px] font-mono text-muted-foreground">{s.nextSessionScore}%</span></div>
                                  <p className="text-[8px] text-muted-foreground truncate">{s.name}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              ) : (
                <div className="px-4 sm:px-5 py-10">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3"><Activity className="w-6 h-6 text-muted-foreground/40" /></div>
                    <p className="text-sm font-medium text-muted-foreground">لا توجد اختيارات اليوم</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1.5 max-w-md">لم تجتز أي أسهم البوابة الأساسية (ربحية، مديونية، تدفق نقدي، تقييم نسبي) والفلاتر الفنية. هذا طبيعي في ظروف السوق الضعيفة.</p>
                  </div>
                </div>
              )}

              {/* Methodology & Disclaimer (A.6, B.6, B.7) */}
              <div className="px-4 sm:px-5 py-2 border-t border-border/30 bg-muted/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[8px] text-muted-foreground/50">
                    {dailyPicksMeta?.version && <span>v{dailyPicksMeta.version}</span>}
                    {dailyPicksMeta?.batchDate && <span>دفعة: {dailyPicksMeta.batchDate}</span>}
                    {dailyPicksMeta?.diversity && <span>{dailyPicksMeta.diversity.sectorCount} قطاعات</span>}
                    {dailyPicksMeta?.dataQuality && <span>بيانات: فني {dailyPicksMeta.dataQuality.techCompleteness}% | أساسي {dailyPicksMeta.dataQuality.fundCompleteness}%</span>}
                    <span>تسوية: T+2</span>
                  </div>
                  <button onClick={() => setShowMethodology(!showMethodology)} className="text-[8px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors">
                    <Eye className="w-2.5 h-2.5" />المنهجية
                  </button>
                </div>
                <p className="text-[8px] text-muted-foreground/40 text-center leading-relaxed">تحليل فني مع بوابة جودة أساسية — ليس توصية مالية. لم يُتحقق عبر اختبار أمامي بعد. لا تُوجد ضمانات بأداء مستقبلي.</p>
                <AnimatePresence>
                  {showMethodology && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-2 pt-2 border-t border-border/20 text-[8px] text-muted-foreground/60 space-y-1 max-w-2xl mx-auto">
                        <p><b className="text-foreground/50">المرحلة 1 — البوابة الأساسية:</b> ربحية (هامش صافي >= 0) | مديونية (D/E <= 10) | تدفق نقدي حر >= 0 | إيرادات > 0 | تقييم نسبي (P/E <= 3x القطاع) | جودة بيانات >= 30% | عملة جنيه مصري</p>
                        <p><b className="text-foreground/50">المرحلة 2 — الترتيب الفني:</b> إشارة (25) | اتجاه (20) | زخم (20) | حجم (15) | مخاطرة:عائد (10) | أنماط (10) = 100. غطاء تعدد العلاقة: 8 نقاط كحد أقصى من المتوسطات</p>
                        <p><b className="text-foreground/50">تكييف EGX:</b> حد سعر يومي +/-16% | توقف 5% | تسوية T+2 | لا يوجد بيع على المكشوف</p>
                        <p><b className="text-foreground/50">B.2:</b> حد قطاعي أقصى 3 من نفس القطاع (عقوبة -8 عند التجاوز)</p>
                        <p><b className="text-foreground/50">B.7:</b> المعاملات مسجلة في إصدار v{dailyPicksMeta?.version || '2.0.0'}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.section>
        )}
'''

new_content = content[:start_idx] + new_section + content[end_idx:]

with open('src/app/analysis/page.tsx', 'w') as f:
    f.write(new_content)

print(f'Successfully replaced Daily Picks section ({end_idx - start_idx} chars replaced with {len(new_section)} chars)')
