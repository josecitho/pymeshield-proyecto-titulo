#!/bin/bash
# =======================================================
# PymeShield - Panel de Ciberseguridad de Red
# Asistente de Instalacion y Configuracion Inicial (Linux)
# =======================================================

echo "======================================================="
echo "  PymeShield - Asistente de Instalacion (Linux)        "
echo "======================================================="
echo ""

# 1. Verificar si Node.js esta instalado
if ! command -v node &> /dev/null; then
    echo "[!] REQUISITO FALTANTE: Node.js no esta instalado."
    echo "PymeShield requiere Node.js para auditar tu red local."
    echo ""
    echo "Como deseas realizar la instalacion de Node.js?"
    echo "  [1] Instalar automaticamente via gestor de paquetes (Recomendado)"
    echo "  [2] Salir para instalar manualmente"
    echo ""
    read -p "Seleccione una opcion [1-2]: " opcion
    
    if [ "$opcion" = "1" ]; then
        echo "[+] Detectando distribucion de Linux e instalando Node.js..."
        if [ -f /etc/debian_version ]; then
            sudo apt-get update && sudo apt-get install -y nodejs npm
        elif [ -f /etc/redhat-release ]; then
            sudo dnf install -y nodejs npm || sudo yum install -y nodejs npm
        elif [ -f /etc/arch-release ]; then
            sudo pacman -Sy --noconfirm nodejs npm
        else
            echo "[ERROR] Distribucion no soportada para instalacion automatica."
            echo "Por favor instale Node.js manualmente usando su gestor de paquetes."
            exit 1
        fi
    else
        echo "Instalacion cancelada. Por favor instale Node.js y vuelva a ejecutar este script."
        exit 0
    fi
else
    echo "[+] Node.js ya esta instalado en este sistema: $(node -v)"
fi

echo ""
echo "======================================================="
echo "  [1/2] Instalando dependencias de software (npm install)"
echo "======================================================="
npm install --no-audit --no-fund

echo ""
echo "======================================================="
echo "  [2/2] Sincronizando base de datos local SQLite (Prisma)"
echo "======================================================="
npx prisma db push

echo ""
echo "======================================================"
echo "  CONFIGURACION COMPLETADA CON EXITO (Linux)          "
echo "======================================================"
echo "  1. Para iniciar PymeShield ejecute: ./Iniciar_PymeShield.sh"
echo "  2. El sistema se abrira en su navegador de Internet."
echo "======================================================"
echo ""
read -p "Presione [Enter] para finalizar..."
