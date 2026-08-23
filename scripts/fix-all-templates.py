import re

with open('/home/z/my-project/src/app/analysis/page.tsx', 'r') as f:
    content = f.read()

# Replace ALL backtick template literals anywhere in the file
# Pattern: `...${expr}...` -> '...' + expr + '...'
def replace_all_templates(text):
    # Find all backtick-delimited strings
    result = []
    i = 0
    while i < len(text):
        if text[i] == '`' and (i == 0 or text[i-1] != '\\'):
            # Find closing backtick
            end = text.find('`', i + 1)
            if end == -1:
                result.append(text[i])
                i += 1
                continue
            inner = text[i+1:end]
            # Split on ${...}
            parts = re.split(r'\\$\\{([^}]+)\\}', inner)
            # Convert to string concatenation
            concat_parts = []
            for j, part in enumerate(parts):
                if j % 2 == 0:
                    if part:
                        concat_parts.append('"' + part + '"')
                else:
                    concat_parts.append('(' + part + ')')
            if concat_parts:
                result.append(' + '.join(concat_parts))
            else:
                result.append('""')
            i = end + 1
        else:
            result.append(text[i])
            i += 1
    return ''.join(result)

new_content = replace_all_templates(content)

with open('/home/z/my-project/src/app/analysis/page.tsx', 'w') as f:
    f.write(new_content)

print('Replaced all template literals')
