@echo off
cd /d "%~dp0"
echo CanvasFlow server: http://127.0.0.1:5173/
echo (Keep this window open. Close it to stop the server.)
node server.js
pause
