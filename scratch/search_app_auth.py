with open(r"C:\Users\josev\Escritorio\ProyectoPymeShield01\ProyectoPymeShield\public\app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("Analyzing app.js for device authorization logic...")
for i, line in enumerate(lines):
    if "isAuthorized" in line or "authorize" in line or "block" in line:
        print(f"Line {i+1}: {line.strip()}")
