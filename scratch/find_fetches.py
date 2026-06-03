import re

with open('static/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'fetch(' in line:
        print(f"L{idx+1}: {line.strip()}")
        # print next 5 lines
        for j in range(1, 10):
            if idx + j < len(lines):
                print(f"  +{j}: {lines[idx+j].strip()}")
        print("-" * 40)
