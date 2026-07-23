@echo off
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
echo ============================================
echo   CanvasFlow - Visual AI Image Workflow
echo ============================================
echo.
echo   Server starting...
node server.js
pause
