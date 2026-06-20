with open(r"C:\Users\josev\Escritorio\ProyectoPymeShield01\ProyectoPymeShield\public\index.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("Analyzing index.html for main tabs and layout...")
for i, line in enumerate(lines):
    if "id=\"tab-" in line or "class=\"nav-link" in line or "<section" in line or "<h2>" in line or "<h3>" in line:
        print(f"Line {i+1}: {line.strip()}")
