@echo off
chcp 65001 >nul
title Shnlfriberg Helper v2.7
cd /d "%~dp0"

echo ================================
echo   Shnlfriberg Helper v2.7
echo ================================
echo.

:: ====== Try to find Python ======
set PYTHON=

:: 1) Try python in PATH
python --version >nul 2>&1
if %errorlevel% equ 0 set PYTHON=python

:: 2) Try python3 in PATH
if "%PYTHON%"=="" (
    python3 --version >nul 2>&1
    if %errorlevel% equ 0 set PYTHON=python3
)

:: 3) Try common install paths
if "%PYTHON%"=="" (
    if exist "C:\Program Files\Python311\python.exe" set PYTHON=C:\Program Files\Python311\python.exe
)
if "%PYTHON%"=="" (
    if exist "C:\Program Files\Python312\python.exe" set PYTHON=C:\Program Files\Python312\python.exe
)
if "%PYTHON%"=="" (
    if exist "C:\Program Files\Python313\python.exe" set PYTHON=C:\Program Files\Python313\python.exe
)
if "%PYTHON%"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
)
if "%PYTHON%"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
)
if "%PYTHON%"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
)

:: ====== If still not found, offer to download ======
if "%PYTHON%"=="" (
    echo [ERROR] Python not found on this computer.
    echo.
    echo This tool requires Python 3.11 or newer to run.
    echo.
    echo Options:
    echo   1. Download Python from the official website
    echo   2. Install it, then run this bat again
    echo.
    choice /C YN /M "Open Python download page in browser?"
    if errorlevel 2 goto :no_python
    start "" "https://www.python.org/downloads/"
    echo.
    echo Download and install Python, then run this bat again.
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
    :no_python
    echo You can download Python manually at:
    echo   https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

:: ====== Show Python version ======
%PYTHON% --version
echo.

:: ====== Install dependencies ======
echo [1/3] Installing dependencies...
%PYTHON% -m pip install -r requirements.txt --quiet 2>nul
if %errorlevel% neq 0 (
    echo Installing dependencies for the first time...
    %PYTHON% -m pip install -r requirements.txt
)
echo [OK] Dependencies ready
echo.

:: ====== Start server ======
echo [2/3] Starting local server...
start /B "" %PYTHON% server.py > server_log.txt 2>&1
timeout /t 3 /nobreak >nul
echo [OK] Server running at http://127.0.0.1:5000
echo.

:: ====== Open files ======
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