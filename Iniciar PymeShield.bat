@echo off
cd /d "%~dp0"
title Lanzador PymeShield
echo =======================================================
echo   PymeShield - Panel de Seguridad de Red para PYMEs
echo =======================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado en este sistema.
    echo Por favor, instale Node.js de https://nodejs.org/ e intente de nuevo.
    echo.
    pause
    exit /b
)

echo [1/4] Liberando puerto 3000 si estuviera ocupado por un servidor previo...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Cerrando proceso antiguo en puerto 3000 con PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [2/4] Verificando e instalando dependencias de Node.js...
call npm install --no-audit --no-fund

echo.
echo [3/4] Sincronizando base de datos SQLite (Prisma)...
call npx prisma db push

echo.
echo [4/4] Iniciando servidor PymeShield...
echo.
echo   ====================================================
echo   PymeShield se esta ejecutando.
echo   La aplicacion se abrira automaticamente en el navegador.
echo   Si no se abre, vaya a: http://localhost:3000
echo   Para detener el servidor, cierre esta ventana de comandos.
echo   ====================================================
echo.

:: Wait 1.5 seconds and open default web browser
timeout /t 2 /nobreak >nul
start "" http://localhost:3000

:: Start express server
node server.js
