@echo off
chcp 65001 >nul
title Shnlfriberg Helper v2.7
cd /d "%~dp0"

echo ================================
echo   Shnlfriberg Helper v2.7
echo   Yi Jian Qi Dong
echo ================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found!
    echo Download: https://www.python.org/downloads/
    echo Remember to check "Add Python to PATH"
    pause
    exit /b 1
)

echo [1/3] Installing dependencies...
pip install -r requirements.txt --quiet 2>nul
if %errorlevel% neq 0 (
    echo First time setup... installing...
    pip install -r requirements.txt
)
echo [OK] Dependencies ready
echo.

echo [2/3] Starting local server...
start /B "" python server.py > server_log.txt 2>&1
timeout /t 3 /nobreak >nul
echo [OK] Server running at http://127.0.0.1:5000
echo.

echo [3/3] Opening script install page...
start "" "shnlfriberg-helper-v2.user.js"
timeout /t 1 /nobreak >nul
start "" "https://shnlfriberg.online/"

echo ================================
echo  All set!
echo.
echo  - Local server: http://127.0.0.1:5000
echo  - Check browser for Tampermonkey install prompt
echo  - Game page should open automatically
echo.
echo  If Tampermonkey doesn't pop up:
echo    1. Open shnlfriberg-helper-v2.user.js manually
echo    2. Or copy content to Tampermonkey's editor
echo       (click monkey icon -> Add new script -> paste -> Ctrl+S)
echo.
echo  NOTE: Close this window = Server stops
echo        Keep it open while playing!
echo.
echo ================================
pause