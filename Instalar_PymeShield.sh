#!/bin/bash
# =======================================================
# PymeShield - Panel de Ciberseguridad de Red
# Asistente de Instalacion y Configuracion Inicial (Linux)
# =======================================================

echo "======================================================="
echo "  PymeShield - Asistente de Instalacion (Linux)        "
echo "======================================================="
echo ""

# 1. Verificar si Node.js y NPM estan instalados
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo "[!] REQUISITO FALTANTE: Node.js o NPM no estan instalados por completo."
    echo "PymeShield requiere Node.js y el gestor NPM para auditar tu red local."
    echo ""
    echo "Como deseas realizar la instalacion de Node.js y NPM?"
    echo "  [1] Instalar automaticamente via gestor de paquetes (Recomendado)"
    echo "  [2] Salir para instalar manualmente"
    echo ""
    read -p "Seleccione una opcion [1-2]: " opcion
    
    if [ "$opcion" = "1" ]; then
        echo "[+] Detectando distribucion de Linux e instalando Node.js y NPM..."
        if [ -f /etc/debian_version ]; then
            # Configurar apt-get para ejecucion 100% no interactiva (evita prompts de libc6)
            export DEBIAN_FRONTEND=noninteractive
            sudo apt-get update && sudo apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nodejs npm
        elif [ -f /etc/redhat-release ]; then
            sudo dnf install -y nodejs npm || sudo yum install -y nodejs npm
        elif [ -f /etc/arch-release ]; then
            sudo pacman -Sy --noconfirm nodejs npm
        else
            echo "[ERROR] Distribucion no soportada para instalacion automatica."
            echo "Por favor instale Node.js y npm manualmente usando su gestor de paquetes."
            exit 1
        fi
    else
        echo "Instalacion cancelada. Por favor instale Node.js/npm y vuelva a ejecutar este script."
        exit 0
    fi
else
    echo "[+] Node.js y NPM ya estan instalados en este sistema: $(node -v) / NPM: $(npm -v)"
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

# Crear Acceso Directo en el Escritorio (Linux .desktop)
DESKTOP_DIR="$HOME/Desktop"
# Alternativa en espanol para Escritorio si existe
if [ ! -d "$DESKTOP_DIR" ] && [ -d "$HOME/Escritorio" ]; then
    DESKTOP_DIR="$HOME/Escritorio"
fi

if [ -d "$DESKTOP_DIR" ]; then
    echo ""
    echo "======================================================="
    echo "  Creando Acceso Directo de PymeShield en tu Escritorio"
    echo "======================================================="
    DESKTOP_FILE="$DESKTOP_DIR/PymeShield.desktop"
    cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Type=Application
Name=PymeShield
Comment=Consola de Ciberseguridad local PymeShield
Exec=$(pwd)/Iniciar_PymeShield.sh
Icon=$(pwd)/pymeshield.ico
Terminal=true
StartupNotify=true
Categories=Utility;Security;
EOF
    chmod +x "$DESKTOP_FILE"
    if command -v gio &> /dev/null; then
        gio set "$DESKTOP_FILE" metadata::trusted true &> /dev/null
    fi
    echo "[+] Acceso directo creado en el Escritorio de Linux."
fi

echo ""
echo "======================================================"
echo "  CONFIGURACION COMPLETADA CON EXITO (Linux)          "
echo "======================================================"
echo "  1. Para iniciar PymeShield ejecute: ./Iniciar_PymeShield.sh"
echo "  2. El sistema se abrira en su navegador de Internet."
echo "======================================================"
echo ""
read -p "Presione [Enter] para finalizar..."
