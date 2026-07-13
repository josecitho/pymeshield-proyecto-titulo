#!/bin/bash
# =======================================================
# PymeShield - Lanzador de Consola de Ciberseguridad (Linux)
# =======================================================

echo "======================================================="
echo "  PymeShield - Iniciando Consola de Seguridad          "
echo "======================================================="

# Liberar puerto 3000 si estuviera ocupado
if command -v fuser &> /dev/null; then
    fuser -k 3000/tcp &> /dev/null
fi

# Intentar abrir el navegador en segundo plano
echo "[+] Abriendo navegador web en http://localhost:3000..."
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000 &
elif command -v open &> /dev/null; then
    open http://localhost:3000 &
elif command -v sensible-browser &> /dev/null; then
    sensible-browser http://localhost:3000 &
fi

# Iniciar servidor Node.js
echo "[+] Iniciando servidor local Node.js..."
node server.js
