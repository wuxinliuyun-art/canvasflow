@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo CanvasFlow v2.5.0 服务器模式
echo.
echo [启动] 正在启动 HTTP 服务...
node server.js
pause
