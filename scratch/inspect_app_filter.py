with open(r"C:\Users\josev\Escritorio\ProyectoPymeShield01\ProyectoPymeShield\public\app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

found = -1
for i, line in enumerate(lines):
    if "function filterAndRenderDevices" in line:
        found = i
        break

if found != -1:
    for idx in range(found, found + 25):
        if idx < len(lines):
            print(f"{idx+1}: {lines[idx].rstrip()}")
else:
    print("filterAndRenderDevices not found")
