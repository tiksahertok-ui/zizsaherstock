// New calcTakeProfits function to replace the old one
// This file is used as a reference, not executed

/*
function calcTakeProfits(t: TechnicalIndicators, signal: SignalType, tf: Timeframe): TakeProfitTarget[] {
  const { close, atr, sma20, sma50, sma100, sma200, bbUpper, bbLower, week52High, week52Low, high, low } = t;
  const atrMul = TF_ADJUST[tf].atrMultiplier;
  const safeAtr = atr > 0 ? atr : close * 0.02;
  const isBull = signal === 'Strong Buy' || signal === 'Buy';
  const isBear = signal === 'Strong Sell' || signal === 'Sell';
  const tps: TakeProfitTarget[] = [];

  // 52W range context
  const w52Range = (week52High > 0 && week52Low > 0) ? week52High - week52Low : 0;
  const w52Pos = w52Range > 0 ? (close - week52Low) / w52Range : 0.5;
  // EGX: realistic per-session targets (circuit breaker 5%, but 2-3% is typical strong move)
  const realisticSessionGain = close * 0.03;
  const moderateGain = close * 0.05;
  const extendedGain = close * 0.08;

  if (isBull) {
    // TP1: BB Upper / SMA50 / prev high / psych level (max 5%)
    const tp1Candidates: { price: number; basis: string; rank: number }[] = [];
    if (bbUpper > 0 && bbUpper > close && bbUpper - close <= moderateGain) tp1Candidates.push({ price: bbUpper, basis: 'BB Upper', rank: 1 });
    if (sma50 > 0 && sma50 > close && sma50 - close <= moderateGain) tp1Candidates.push({ price: sma50, basis: 'SMA50', rank: 2 });
    if (high > 0 && high > close && high - close <= realisticSessionGain) tp1Candidates.push({ price: high, basis: 'أعلى جلسة سابقة', rank: 3 });
    const rnd1 = nextRoundAbove(close);
    if (rnd1 > close && rnd1 - close <= moderateGain) tp1Candidates.push({ price: rnd1, basis: 'مستوى نفسي', rank: 4 });
    const atrTP1 = close + safeAtr * 1 * atrMul;
    tp1Candidates.push({ price: atrTP1, basis: `${round2(1 * atrMul)}× ATR`, rank: 5 });
    const minTP1Dist = close * 0.005;
    tp1Candidates.sort((a, b) => a.rank - b.rank);
    let tp1 = atrTP1;
    for (const c of tp1Candidates) { if (c.price - close >= minTP1Dist) { tp1 = c.price; break; } }
    tp1 = Math.min(tp1, close + moderateGain);
    const tp1Basis = tp1Candidates.find(c => Math.abs(c.price - tp1) < 0.01)?.basis || `${round2(1 * atrMul)}× ATR`;
    tps.push({ level: 1, price: round2(tp1), basis: tp1Basis, probability: 'High' });

    // TP2: SMA100/SMA200/52W 50% (max 8%)
    const tp2Candidates: { price: number; basis: string; rank: number }[] = [];
    if (sma100 > 0 && sma100 > tp1 && sma100 - close <= extendedGain) tp2Candidates.push({ price: sma100, basis: 'SMA100', rank: 1 });
    if (sma200 > 0 && sma200 > tp1 && sma200 - close <= extendedGain) tp2Candidates.push({ price: sma200, basis: 'SMA200', rank: 2 });
    if (w52Range > 0) { const t50 = close + w52Range * (1 - w52Pos) * 0.5; if (t50 > tp1 + minTP1Dist && t50 - close <= extendedGain) tp2Candidates.push({ price: t50, basis: '50% نطاق 52أ', rank: 3 }); }
    const rnd2 = nextRoundAbove(tp1);
    if (rnd2 > tp1 + minTP1Dist && rnd2 - close <= extendedGain) tp2Candidates.push({ price: rnd2, basis: 'مستوى نفسي', rank: 4 });
    const atrTP2 = close + safeAtr * 2 * atrMul;
    tp2Candidates.push({ price: atrTP2, basis: `${round2(2 * atrMul)}× ATR`, rank: 5 });
    tp2Candidates.sort((a, b) => a.rank - b.rank);
    let tp2 = atrTP2;
    for (const c of tp2Candidates) { if (c.price > tp1 + minTP1Dist) { tp2 = c.price; break; } }
    tp2 = Math.min(tp2, close + extendedGain);
    const tp2Basis = tp2Candidates.find(c => Math.abs(c.price - tp2) < 0.01)?.basis || `${round2(2 * atrMul)}× ATR`;
    tps.push({ level: 2, price: round2(tp2), basis: tp2Basis, probability: 'Medium' });

    // TP3: 52W high/80% range (max 16%)
    const tp3Candidates: { price: number; basis: string; rank: number }[] = [];
    if (week52High > 0 && week52High > tp2) { const d = week52High - close; if (d <= close * 0.16) tp3Candidates.push({ price: week52High, basis: '52أسبوع أعلى', rank: 1 }); }
    if (w52Range > 0) { const t80 = close + w52Range * (1 - w52Pos) * 0.8; if (t80 > tp2 + minTP1Dist && t80 - close <= close * 0.16) tp3Candidates.push({ price: t80, basis: '80% نطاق 52أ', rank: 2 }); }
    const rnd3 = nextRoundAbove(tp2);
    if (rnd3 > tp2 + minTP1Dist) tp3Candidates.push({ price: rnd3, basis: 'مستوى نفسي', rank: 3 });
    const atrTP3 = close + safeAtr * 3.5 * atrMul;
    tp3Candidates.push({ price: atrTP3, basis: `${round2(3.5 * atrMul)}× ATR`, rank: 4 });
    tp3Candidates.sort((a, b) => a.rank - b.rank);
    let tp3 = atrTP3;
    for (const c of tp3Candidates) { if (c.price > tp2 + minTP1Dist) { tp3 = c.price; break; } }
    tp3 = Math.min(tp3, close * 1.16);
    const tp3Basis = tp3Candidates.find(c => Math.abs(c.price - tp3) < 0.01)?.basis || `${round2(3.5 * atrMul)}× ATR`;
    tps.push({ level: 3, price: round2(tp3), basis: tp3Basis, probability: 'Low' });

  } else if (isBear) {
    const minTPDist = close * 0.005;
    const tp1Candidates: { price: number; basis: string; rank: number }[] = [];
    if (bbLower > 0 && bbLower < close && close - bbLower <= moderateGain) tp1Candidates.push({ price: bbLower, basis: 'BB Lower', rank: 1 });
    if (sma50 > 0 && sma50 < close && close - sma50 <= moderateGain) tp1Candidates.push({ price: sma50, basis: 'SMA50', rank: 2 });
    if (low > 0 && low < close && close - low <= realisticSessionGain) tp1Candidates.push({ price: low, basis: 'أدنى جلسة سابقة', rank: 3 });
    const rnd1 = nextRoundBelow(close);
    if (rnd1 < close && close - rnd1 <= moderateGain) tp1Candidates.push({ price: rnd1, basis: 'مستوى نفسي', rank: 4 });
    const atrTP1 = close - safeAtr * 1 * atrMul;
    tp1Candidates.push({ price: atrTP1, basis: `${round2(1 * atrMul)}× ATR`, rank: 5 });
    tp1Candidates.sort((a, b) => a.rank - b.rank);
    let tp1 = atrTP1;
    for (const c of tp1Candidates) { if (close - c.price >= minTPDist) { tp1 = c.price; break; } }
    tp1 = Math.max(tp1, close - moderateGain);
    const tp1Basis = tp1Candidates.find(c => Math.abs(c.price - tp1) < 0.01)?.basis || `${round2(1 * atrMul)}× ATR`;
    tps.push({ level: 1, price: round2(tp1), basis: tp1Basis, probability: 'High' });

    const tp2Candidates: { price: number; basis: string; rank: number }[] = [];
    if (sma100 > 0 && sma100 < tp1) tp2Candidates.push({ price: sma100, basis: 'SMA100', rank: 1 });
    if (sma200 > 0 && sma200 < tp1) tp2Candidates.push({ price: sma200, basis: 'SMA200', rank: 2 });
    if (w52Range > 0) { const t50 = close - w52Range * w52Pos * 0.5; if (t50 < tp1 - minTPDist && close - t50 <= extendedGain) tp2Candidates.push({ price: t50, basis: '50% نطاق 52أ', rank: 3 }); }
    const atrTP2 = close - safeAtr * 2 * atrMul;
    tp2Candidates.push({ price: atrTP2, basis: `${round2(2 * atrMul)}× ATR`, rank: 4 });
    tp2Candidates.sort((a, b) => a.rank - b.rank);
    let tp2 = atrTP2;
    for (const c of tp2Candidates) { if (c.price < tp1 - minTPDist) { tp2 = c.price; break; } }
    tp2 = Math.max(tp2, close - extendedGain);
    const tp2Basis = tp2Candidates.find(c => Math.abs(c.price - tp2) < 0.01)?.basis || `${round2(2 * atrMul)}× ATR`;
    tps.push({ level: 2, price: round2(tp2), basis: tp2Basis, probability: 'Medium' });

    const tp3Candidates: { price: number; basis: string; rank: number }[] = [];
    if (week52Low > 0 && week52Low < tp2 && close - week52Low <= close * 0.16) tp3Candidates.push({ price: week52Low, basis: '52أسبوع أدنى', rank: 1 });
    if (w52Range > 0) { const t80 = close - w52Range * w52Pos * 0.8; if (t80 < tp2 - minTPDist && close - t80 <= close * 0.16) tp3Candidates.push({ price: t80, basis: '80% نطاق 52أ', rank: 2 }); }
    const atrTP3 = close - safeAtr * 3.5 * atrMul;
    tp3Candidates.push({ price: atrTP3, basis: `${round2(3.5 * atrMul)}× ATR`, rank: 3 });
    tp3Candidates.sort((a, b) => a.rank - b.rank);
    let tp3 = atrTP3;
    for (const c of tp3Candidates) { if (c.price < tp2 - minTPDist) { tp3 = c.price; break; } }
    tp3 = Math.max(tp3, close * 0.84);
    const tp3Basis = tp3Candidates.find(c => Math.abs(c.price - tp3) < 0.01)?.basis || `${round2(3.5 * atrMul)}× ATR`;
    tps.push({ level: 3, price: round2(tp3), basis: tp3Basis, probability: 'Low' });

  } else {
    const trendUp = (sma50 > 0 && close > sma50) || (sma200 > 0 && close > sma200);
    const dir = trendUp ? 1 : -1;
    tps.push({ level: 1, price: round2(close + dir * safeAtr * 1 * atrMul), basis: `${round2(1 * atrMul)}× ATR (trend)`, probability: 'Medium' });
    tps.push({ level: 2, price: round2(close + dir * safeAtr * 2 * atrMul), basis: `${round2(2 * atrMul)}× ATR (trend)`, probability: 'Low' });
    tps.push({ level: 3, price: round2(close + dir * safeAtr * 3.5 * atrMul), basis: `${round2(3.5 * atrMul)}× ATR (trend)`, probability: 'Low' });
  }
  return tps;
}
*/
