with open(r"C:\Users\josev\Escritorio\ProyectoPymeShield01\ProyectoPymeShield\server.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("Analyzing server.js for zeroTrustMode...")
for i, line in enumerate(lines):
    if "zeroTrustMode" in line:
        print(f"Line {i+1}: {line.strip()}")
