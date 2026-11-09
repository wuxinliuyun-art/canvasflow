@echo off
setlocal

where codex >nul 2>nul
if errorlevel 1 (
  echo [error] Codex CLI was not found in PATH.
  pause
  exit /b 1
)

codex mcp get canvasflow >nul 2>nul
if errorlevel 1 (
  echo CanvasFlow MCP is not registered.
  pause
  exit /b 0
)

choice /c YN /n /m "Remove the CanvasFlow MCP registration? [Y/N] "
if errorlevel 2 exit /b 0

codex mcp remove canvasflow
if errorlevel 1 (
  echo [error] CanvasFlow MCP removal failed.
  pause
  exit /b 1
)

echo CanvasFlow MCP was removed. Restart Codex or start a new task.
pause
exit /b 0
