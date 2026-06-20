@echo off
title Asistente de Instalación - PymeShield
echo =======================================================
echo   PymeShield - Panel de Ciberseguridad de Red
echo   Asistente de Instalación y Configuración Inicial
echo =======================================================
echo.

:: 1. Verificar si Node.js ya está instalado en el sistema
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [+] Node.js ya está instalado en este equipo.
    goto DEPENDENCIAS
)

:MENU
echo [!] REQUISITO FALTANTE: Node.js no está instalado.
echo PymeShield requiere la plataforma Node.js para poder auditar tu red local.
echo.
echo ¿Cómo desea realizar la instalación de Node.js?
echo.
echo   [1] Instalación Automática (Recomendado)
echo       El instalador descargará e instalará Node.js LTS de forma segura
echo       en segundo plano desde su sitio oficial (nodejs.org).
echo.
echo   [2] Instalación Manual (Seguro)
echo       Abriremos el sitio oficial de Node.js en su navegador web
echo       para que usted descargue e instale el programa por su cuenta.
echo.
echo   [3] Cancelar Instalación y Salir
echo.
set /p opcion="Seleccione una opción (1, 2 o 3): "

if "%opcion%"=="1" goto AUTO_INSTALL
if "%opcion%"=="2" goto MANUAL_INSTALL
if "%opcion%"=="3" goto CANCELAR
echo.
echo [!] Opción inválida. Por favor seleccione 1, 2 o 3.
echo.
goto MENU

:AUTO_INSTALL
echo.
echo [+] Iniciando Descarga Automática de Node.js LTS...
echo     Descargando instalador seguro desde nodejs.org, por favor espere...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '$env:TEMP\node-setup.msi'"
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo descargar Node.js. Verifique su conexión a Internet.
    pause
    goto MENU
)

echo [+] Instalando Node.js de forma silenciosa en segundo plano...
echo     Esta operación puede tardar un minuto. Por favor, espere...
powershell -Command "Start-Process msiexec.exe -ArgumentList '/i', '$env:TEMP\node-setup.msi', '/quiet', '/norestart' -Wait"

:: Refrescar temporalmente el PATH en la sesión de CMD actual para continuar sin reiniciar consola
echo [+] Actualizando variables de entorno locales de la sesión...
set "PATH=%PATH%;C:\Program Files\nodejs\"
set "PATHEXT=%PATHEXT%;.JS"

:: Re-verificar si la instalación automática fue exitosa
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] La instalación automática falló. Intente con la opción manual [2].
    pause
    goto MENU
)
echo [+] Node.js instalado de forma automática exitosamente.
goto DEPENDENCIAS

:MANUAL_INSTALL
echo.
echo [+] Abriendo página oficial de Node.js en su navegador...
start https://nodejs.org/es
echo =======================================================
echo   1. En el navegador, descargue e instale la versión 'LTS'.
echo   2. Ejecute el instalador y presione 'Siguiente' a todos los pasos.
echo   3. Una vez finalizada la instalación de Windows, vuelva aquí.
echo =======================================================
echo.
echo Presione cualquier tecla CUANDO HAYA TERMINADO la instalación manual en su equipo...
pause >nul

:: Re-chequear si Node.js está disponible ahora (usando powershell para refrescar variables de entorno de registro)
powershell -Command "if (Get-Command node -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %errorlevel% neq 0 (
    echo [!] No se detectó la instalación todavía en el sistema.
    echo     Asegúrese de haber completado todo el asistente de instalación de Node.js.
    pause
    goto MENU
)

:: Agregar la ruta instalada manualmente al path local de esta ventana para continuar el flujo
set "PATH=%PATH%;C:\Program Files\nodejs\"
set "PATHEXT=%PATHEXT%;.JS"
echo [+] Node.js detectado exitosamente tras la instalación manual.
goto DEPENDENCIAS

:DEPENDENCIAS
echo.
echo =======================================================
echo   [1/2] Instalando dependencias de software (npm install)
echo =======================================================
echo.
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [ERROR] Falló la instalación de las dependencias de Node.js.
    pause
    exit /b
)

echo.
echo =======================================================
echo   [2/2] Sincronizando base de datos local SQLite (Prisma)
echo =======================================================
echo.
call npx prisma db push
if %errorlevel% neq 0 (
    echo [ERROR] Falló la sincronización y estructuración de la base de datos.
    pause
    exit /b
)

echo.
echo =======================================================
echo   Creando Acceso Directo de PymeShield en tu Escritorio
echo =======================================================
:: Crear un acceso directo dinámico (.lnk) en el escritorio de Windows del usuario actual con el icono personalizado
powershell -Command "$s=(New-Object -ComObject WScript.Shell);$d=$s.SpecialFolders('Desktop');$shortcut=$s.CreateShortcut($d + '\PymeShield.lnk');$shortcut.TargetPath='%~dp0Iniciar PymeShield.bat';$shortcut.IconLocation='%~dp0pymeshield.ico';$shortcut.WorkingDirectory='%~dp0';$shortcut.Save()"
echo [+] Acceso directo creado en el Escritorio.

echo.
echo   ====================================================
echo   CONFIGURACIÓN COMPLETADA CON ÉXITO
echo   ====================================================
echo   1. Se ha creado un acceso directo en tu Escritorio llamado 'PymeShield'.
echo   2. Para iniciar la plataforma en el futuro, solo haz doble clic en él.
echo   3. El sistema se abrirá automáticamente en tu navegador.
echo   ====================================================
echo.
pause
start "" http://localhost:3000
node server.js
exit /b

:CANCELAR
echo.
echo [-] Instalación cancelada por el usuario. PymeShield no se ha configurado.
echo.
pause
exit /b
