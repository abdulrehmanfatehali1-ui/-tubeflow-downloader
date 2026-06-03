with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'mail' in line.lower() and ('panel' in line.lower() or 'container' in line.lower() or 'section' in line.lower()):
        print(f"L{idx+1}: {line.strip()}")
