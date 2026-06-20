import re

with open(r"C:\Users\josev\Escritorio\ProyectoPymeShield01\ProyectoPymeShield\server.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("Analyzing server.js for routes and device handling...")
for i, line in enumerate(lines):
    if "app.get(" in line or "app.post(" in line or "app.put(" in line or "app.delete(" in line or "prisma.device" in line:
        print(f"Line {i+1}: {line.strip()}")
