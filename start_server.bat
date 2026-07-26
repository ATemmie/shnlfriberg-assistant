@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================
echo CS Player Assistant - Server
echo ============================
echo.
"C:\Users\34934.ATEMMIE\AppData\Local\Programs\Python\Python311\python.exe" server.py
if errorlevel 1 (
    echo Failed to start. Check Python installation.
    pause
)