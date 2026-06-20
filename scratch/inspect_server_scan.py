with open(r"C:\Users\josev\Escritorio\ProyectoPymeShield01\ProyectoPymeShield\server.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx in range(1185, 1260):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx].rstrip()}")
