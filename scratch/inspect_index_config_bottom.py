with open(r"C:\Users\josev\Escritorio\ProyectoPymeShield01\ProyectoPymeShield\public\index.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx in range(580, 660):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx].rstrip()}")
