const fs = require('fs');

let c = fs.readFileSync('src/app/analysis/page.tsx', 'utf8');

// 1. Replace dailyPicks filter
const oldFilter = `const dailyPicks = useMemo(() => {\n    return stocks\n      .filter(s => (s.signal === 'Strong Buy' || s.signal === 'Buy') && s.confidence >= 40 && s.riskReward >= 1.0)\n      .sort((a, b) => {\n        if (a.signal === 'Strong Buy' && b.signal !== 'Strong Buy') return -1;\n        if (b.signal === 'Strong Buy' && a.signal !== 'Strong Buy') return 1;\n        return b.confidence - a.confidence;\n      })\n      .slice(0, 12);\n  }, [stocks]);`;

const newFilter = `// Buy/Strong Buy picks for daily recommendations (relaxed filter to show all actionable signals)\n  const dailyBuyPicks = useMemo(() => {\n    return stocks\n      .filter(s => (s.signal === 'Strong Buy' || s.signal === 'Buy') && s.confidence >= 25)\n      .sort((a, b) => {\n        if (a.signal === 'Strong Buy' && b.signal !== 'Strong Buy') return -1;\n        if (b.signal === 'Strong Buy' && a.signal !== 'Strong Buy') return 1;\n        return b.confidence - a.confidence;\n      });\n  }, [stocks]);\n\n  // Sell/Strong Sell picks for daily recommendations\n  const dailySellPicks = useMemo(() => {\n    return stocks\n      .filter(s => (s.signal === 'Strong Sell' || s.signal === 'Sell') && s.confidence >= 30)\n      .sort((a, b) => {\n        if (a.signal === 'Strong Sell' && b.signal !== 'Strong Sell') return -1;\n        if (b.signal === 'Strong Sell' && a.signal !== 'Strong Sell') return 1;\n        return b.confidence - a.confidence;\n      });\n  }, [stocks]);\n\n  const dailyPicks = useMemo(() => [...dailyBuyPicks, ...dailySellPicks], [dailyBuyPicks, dailySellPicks]);`;

c = c.replace(oldFilter, newFilter);

console.log('1. Filter replaced:', c.includes('dailyBuyPicks') ? 'OK' : 'FAIL');

// Save checkpoint
fs.writeFileSync('src/app/analysis/page.tsx', c, 'utf-8');
console.log('Saved checkpoint');

// 2. Replace DAILY PICKS section
const startMarker = '{/* ═══ DAILY PICKS ═══ */}';
const endMarker = '{/* ═══ STATS + DISTRIBUTION ═══ */}';

const si = c.indexOf(startMarker);
const ei = c.indexOf(endMarker);
console.log('2. Picks section:', si, '->', ei);

if (si === -1 || ei === -1) { console.log('FAIL: markers not found'); process.exit(1); }

const dailyPicksNew = fs.readFileSync('/home/z/my-project/scripts/daily-picks-section.txt', 'utf-8');
c = c.slice(0, si) + dailyPicksNew + c.slice(ei);

console.log('2. Picks replaced, total lines:', c.split('\n').length);

fs.writeFileSync('src/app/analysis/page.tsx', c, 'utf-8');
console.log('3. Saved');
