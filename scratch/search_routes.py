with open('app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if '@app.route(' in line:
        print(f"L{idx+1}: {line.strip()}")
