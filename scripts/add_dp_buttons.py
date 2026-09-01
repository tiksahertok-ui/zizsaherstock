import sys

with open('src/app/analysis/page.tsx', 'r') as f:
    content = f.read()

# 1. Add force-recompute button to header
old = '{dailyPicksMeta?.marketContext && ('
                      <span className={"text-[8px] font-medium px-2 py-0.5 rounded-md border " + (dailyPicksMeta.marketContext.regime === 'bullish' ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' : dailyPicksMeta.marketContext.regime === 'bearish' ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'text-amber-600 bg-amber-500/10 border-amber-500/20')}>'
                        EGX30 {dailyPicksMeta.marketContext.egx30ChangePct >= 0 ? '+' : ''}{dailyPicksMeta.marketContext.egx30ChangePct.toFixed(1)}%'
                      </span>'
                    )}
                    <span className="text-[8px] text-muted-foreground">{dailyPicksMeta.fundamentalPass} أساسي | {dailyPicksMeta.technicalPass} فني</span>
                    <Badge className="text-[9px] bg-emerald-500 text-white border-emerald-500 h-5 rounded-md px-2 font-bold gap-1">'
                      <TrendingUp className="w-2.5 h-2.5" />{dailyPicks.length} اختيارات'
                    </Badge>'

new = '{dailyPicksMeta?.marketContext && ('
                      <span className={"text-[8px] font-medium px-2 py-0.5 rounded-md border " + (dailyPicksMeta.marketContext.regime === 'bullish' ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' : dailyPicksMeta.marketContext.regime === 'bearish' ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'text-amber-600 bg-amber-500/10 border-amber-500/20')}>'
                        EGX30 {dailyPicksMeta.marketContext.egx30ChangePct >= 0 ? '+' : ''}{dailyPicksMeta.marketContext.egx30ChangePct.toFixed(1)}%'
                      </span>'
                    )}
                    <span className="text-[8px] text-muted-foreground">{dailyPicksMeta.fundamentalPass} أساسي | {dailyPicksMeta.technicalPass} فني</span>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-muted/80 text-muted-foreground/60" onClick={handleRecompute}><RefreshCw className="w-3.5 h-3.5" /></Button>
                    </TooltipTrigger><TooltipContent>إعادة حساب الدفعة</TooltipContent></Tooltip></TooltipProvider>
                    <Badge className="text-[9px] bg-emerald-500 text-white border-emerald-500 h-5 rounded-md px-2 font-bold gap-1">'
                      <TrendingUp className="w-2.5 h-2.5" />{dailyPicks.length} اختيارات
                    </Badge>'

if old not in content:
    print('ERROR: old string not found')
    sys.exit(1)

content = content.replace(old, new)

# 2. Add handleRecompute callback
old_effect = """"  useEffect(() => { fetchDailyPicks(); }, [fetchDailyPicks]);"""
new_effect = """"  useEffect(() => { fetchDailyPicks(); }, [fetchDailyPicks]);

  const handleRecompute = useCallback(async () => {\n    setDailyPicksLoading(true);\n    try {\n      const res = await fetch(`/api/analysis/daily-picks?timeframe=${timeframe}&force=true`);\n      if (!res.ok) throw new Error('fail');\n      const data = await res.json();\n      setDailyPicks((data.picks || []).filter((p: DailyPick) => !p.isNextInLine));\n      setNextInLine((data.nextInLine || []).filter((p: DailyPick) => p.isNextInLine));\n      setDailyPicksMeta({\n        fundamentalPass: data.fundamentalPass || 0, technicalPass: data.technicalPass || 0,\n        totalUniverse: data.totalUniverse || 0, version: data._meta?.scoringVersion,\n        generatedAt: data.generatedAt, disclaimer: data._meta?.disclaimer,\n        batchDate: data._meta?.batchDate, countNote: data.countNote || '',\n        methodology: data._meta?.methodology, marketContext: data.marketContext,\n        dataQuality: data.dataQuality, diversity: data.diversity,\n      });\n      toast.success('تم إعادة حساب الدفعة بنجاح');\n    } catch { toast.error('فشل إعادة حساب الدفعة'); }\n    finally { setDailyPicksLoading(false); }\n  }, [timeframe]);"""

content = content.replace(old_effect, new_effect)

with open('src/app/analysis/page.tsx', 'w') as f:
    f.write(content)

print('Successfully added force-recompute button and handleRecompute callback')
