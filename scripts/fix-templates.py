import re

with open('/home/z/my-project/src/app/analysis/page.tsx', 'r') as f:
    content = f.read()

# Fix style={{ width: `${...}` }} too
def fix_tmpl(m):
    full = m.group(0)
    inner = m.group(1)
    # Split on ${...} but keep parts
    parts = re.split(r'\$\{([^}]+)\}', inner)
    result = []
    for i, part in enumerate(parts):
        if i % 2 == 0:
            if part:
                result.append('"' + part + '"')
        else:
            result.append(part)
    joined = ' + '.join(result)
    # Determine if it was className or style
    if 'className' in full[:20]:
        return 'className={' + joined + '}'
    else:
        return 'style={{ width: ' + joined + ' }}'

# Replace all template literals in className={...} and style={{...}}
new_content = re.sub(
    r'className=\{`([^`]+)`\}',
    lambda m: 'className={' + re.sub(r'\$\{([^}]+)\}', lambda v: '" + ' + v.group(1) + ' + "', m.group(1)) + '}',
    content
)

new_content = re.sub(
    r'style=\{\{ width: `([^`]+)` \}\}',
    lambda m: 'style={{ width: ' + re.sub(r'\$\{([^}]+)\}', lambda v: '" + ' + v.group(1) + ' + "', m.group(1)) + ' }}',
    new_content
)

with open('/home/z/my-project/src/app/analysis/page.tsx', 'w') as f:
    f.write(new_content)

print('Fixed all template literals')
