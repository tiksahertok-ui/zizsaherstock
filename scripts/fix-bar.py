with open('src/app/analysis/page.tsx','r') as f: lines=f.readlines()

start = None
end = None
for i, line in enumerate(lines):
    if 'bg-slate-400' in line and '.join' in line and i > 260 and i < 280:
        start = i
    if start and 'TooltipProvider' in line and i > start+5:
        end = i
        break

print('start:', start+1, 'end:', end+1 if end else 'N/A')

new_lines = lines[:start] + [
    '            {tps.map((tp) => {\n',
    '              const tpCls = tp.probability === \'High\' ? \'bg-emerald-400\' : tp.probability === \'Medium\' ? \'bg-amber-400\' : \'bg-slate-400\';\n',
    '              return (\n',
    '                <TooltipProvider key={tp.level} delayDuration={150}><Tooltip><TooltipTrigger asChild>\n',
    '                  <div className={\x60absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-background z-20 \x24{tpCls}\x60} style={{ left: \x60calc(\x24{pos(tp.price)}% - 4px)\x60 }} />\n',
    '                </TooltipTrigger><TooltipContent side="top" className="text-[10px] py-1">\n',
    '                  <span className="font-bold">م{tp.level}: {tp.price.toFixed(2)}</span>\n',
    '                  <span className="text-muted-foreground mr-1">({((tp.price - entry) / entry * 100 >= 0 ? \'+\' : \'\')}{((tp.price - entry) / entry * 100).toFixed(1)}%)</span>\n',
    '                </TooltipContent></Tooltip></TooltipProvider>\n',
    '              );\n',
    '            })}\n',
] + lines[end:]

with open('src/app/analysis/page.tsx','w') as f: f.writelines(new_lines)
print('Fixed')
