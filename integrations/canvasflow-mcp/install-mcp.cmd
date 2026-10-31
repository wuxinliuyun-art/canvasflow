@echo off
setlocal

set "MCP_DIR=%~dp0"
set "MCP_EXE=%MCP_DIR%CanvasFlow.Mcp.exe"
set "MCP_PROJECT=%MCP_DIR%CanvasFlow.Mcp.csproj"

where codex >nul 2>nul
if errorlevel 1 (
  echo [error] Codex CLI was not found in PATH.
  echo Install or update Codex, then run this file again.
  pause
  exit /b 1
)

set "MCP_MODE="
if exist "%MCP_EXE%" set "MCP_MODE=exe"
if not defined MCP_MODE if exist "%MCP_PROJECT%" (
  where dotnet >nul 2>nul
  if errorlevel 1 (
    echo [error] .NET SDK was not found in PATH.
    echo Use the CanvasFlow installer build, or install the .NET SDK.
    pause
    exit /b 1
  )
  set "MCP_MODE=source"
)

if not defined MCP_MODE (
  echo [error] CanvasFlow MCP files were not found beside this script.
  pause
  exit /b 1
)

codex mcp get canvasflow >nul 2>nul
if not errorlevel 1 (
  echo CanvasFlow MCP is already registered.
  choice /c YN /n /m "Replace the existing registration? [Y/N] "
  if errorlevel 2 exit /b 0
  codex mcp remove canvasflow >nul
  if errorlevel 1 (
    echo [error] Could not remove the existing registration.
    pause
    exit /b 1
  )
)

if /i "%MCP_MODE%"=="exe" (
  codex mcp add canvasflow -- "%MCP_EXE%"
) else (
  codex mcp add canvasflow -- dotnet run --project "%MCP_PROJECT%"
)

if errorlevel 1 (
  echo [error] CanvasFlow MCP registration failed.
  pause
  exit /b 1
)

echo.
echo CanvasFlow MCP is registered.
echo Restart Codex or start a new task before using it.
echo To remove it later, run uninstall-mcp.cmd.
pause
exit /b 0
