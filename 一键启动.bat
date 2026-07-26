@echo off
chcp 65001 >nul
title Shnlfriberg Helper v2.7
cd /d "%~dp0"

set PYTHON="C:\Users\34934.ATEMMIE\AppData\Local\Programs\Python\Python311\python.exe"

echo ================================
echo   Shnlfriberg Helper v2.7
echo   Yi Jian Qi Dong
echo ================================
echo.

%PYTHON% --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found at:
    echo   C:\Users\34934.ATEMMIE\AppData\Local\Programs\Python\Python311\python.exe
    echo.
    echo If you moved Python, edit this bat file and fix the path.
    pause
    exit /b 1
)

echo [1/3] Installing dependencies...
%PYTHON% -m pip install -r requirements.txt --quiet 2>nul
if %errorlevel% neq 0 (
    echo First time setup... installing...
    %PYTHON% -m pip install -r requirements.txt
)
echo [OK] Dependencies ready
echo.

echo [2/3] Starting local server...
start /B "" %PYTHON% server.py > server_log.txt 2>&1
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
echo       (click monkey icon -^> Add new script -^> paste -^> Ctrl+S)
echo.
echo  NOTE: Close this window = Server stops
echo        Keep it open while playing!
echo.
echo ================================
pause