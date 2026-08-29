with open('src/app/analysis/page.tsx','r') as f: lines=f.readlines()

# Lines 267-275 (0-indexed 266-274) need to be replaced
old = lines[266:275]
for i,l in enumerate(old): print(f'{267+i}: {l}', end='')
