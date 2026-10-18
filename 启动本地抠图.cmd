@echo off
setlocal
set "NUMBA_CACHE_DIR=%~dp0data\matting-cache"
if not exist "F:\ø®≈∆”Œœ∑demo\.venv\Scripts\python.exe" (
  echo Local matting Python environment was not found.
  pause
  exit /b 1
)
cd /d "F:\ø®≈∆”Œœ∑demo"
".venv\Scripts\python.exe" "tools\matting_server.py" --port 8790
if errorlevel 1 pause
