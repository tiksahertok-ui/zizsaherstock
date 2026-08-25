import re

with open('src/app/analysis/page.tsx','r') as f: content=f.read()

# Find the problem area
old = '''            {tps.map((tp) => (
              <TooltipProvider key={tp.level} delayDuration={150}><Tooltip><TooltipTrigger asChild>
                <div className={["absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-background z-20",
                  tp.probability === 'High' ? 'bg-emerald-400' : tp.probability === 'Medium' ? 'bg-amber-400' : 'bg-slate-400'].join(' ')} style={{ left: `''' + '''calc(${pos(tp.price)}% - 4px)`''' + ''' }} />
              </TooltipTrigger>'''

new = '''            {tps.map((tp) => {
              const tpCls = tp.probability === 'High' ? 'bg-emerald-400' : tp.probability === 'Medium' ? 'bg-amber-400' : 'bg-slate-400';
              return (
                <TooltipProvider key={tp.level} delayDuration={150}><Tooltip><TooltipTrigger asChild>
                  <div className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-background z-20 ${tpCls}`} style={{ left: `''' + 'calc(${pos(tp.price)}% - 4px)` + ''' }} />
                </TooltipTrigger>'''

if old in content:
    content = content.replace(old, new)
    print('Replaced compact TP section')
else:
    print('NOT FOUND - searching...')
    # Try to find a shorter substring
    idx = content.find('.join(\' \' ')')
    print(f'Found .join at char {idx}')
    if idx >= 0:
        print(repr(content[idx-50:idx+50]))
