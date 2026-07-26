@echo off
chcp 65001 >nul
title Shnlfriberg Helper v2.7 — 一键启动器
cd /d "%~dp0"

:: ========================================
:: 检查 Python 是否可用
:: ========================================
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python！
    echo.
    echo 请先安装 Python 3.11+：https://www.python.org/downloads/
    echo 安装时记得勾选 "Add Python to PATH"
    pause
    exit /b 1
)

:: ========================================
:: 检查依赖
:: ========================================
echo.
echo ====================================
echo   Shnlfriberg Helper v2.7
echo   启动中...
echo ====================================
echo.
echo  [1/3] 检查依赖...
pip install -r requirements.txt --quiet 2>nul
if %errorlevel% neq 0 (
    echo  [!] 首次安装依赖中...
    pip install -r requirements.txt
)
echo  [OK] 依赖检查完毕
echo.

:: ========================================
:: 启动本地服务器（后台）
:: ========================================
echo  [2/3] 启动本地推荐服务器...
start /B "" python server.py > server_log.txt 2>&1
timeout /t 3 /nobreak >nul
echo  [OK] 服务器已启动 ^(http://127.0.0.1:5000^)
echo.

:: ========================================
:: 打开脚本 → 触发 Tampermonkey 安装
:: ========================================
echo  [3/3] 打开脚本安装页面...
echo.
echo  ^> 正在用浏览器打开 .user.js 文件...
echo  ^> 如果已安装 Tampermonkey，它会自动弹出安装提示
echo.
start "" "shnlfriberg-helper-v2.user.js"

:: ========================================
:: 打开游戏网站
:: ========================================
echo  即将打开游戏网站...
timeout /t 2 /nobreak >nul
start "" "https://shnlfriberg.online/"

echo ====================================
echo  启动完成！
echo.
echo  ✅ 本地服务器: http://127.0.0.1:5000
echo  ✅ 脚本安装: 请查看浏览器 Tampermonkey 提示
echo  ✅ 游戏网址: 已打开
echo.
echo  ⚠ 如果 Tampermonkey 没有自动弹出：
echo     (1) 手动打开 shnlfriberg-helper-v2.user.js
echo     (2) 或复制文件内容 →
echo         点击 Tampermonkey 图标 → 添加新脚本
echo         → 粘贴 → Ctrl+S 保存
echo.
echo  ⚠ 关闭本窗口 = 关闭服务器
echo     想保持服务器运行就不要关这个窗口
echo.
echo ====================================
pause
