@echo off
rem CanvasFlow PS panel - manual test installer (demo, ASCII only)
rem Copies the panel to the per-user Adobe CEP extensions folder and enables
rem the CEP PlayerDebugMode flag (required for unsigned developer panels).
setlocal
set "SRC=%~dp0CanvasFlowPanel"
if not exist "%SRC%\CSXS\manifest.xml" (
  echo [ERROR] CanvasFlowPanel folder not found next to this script.
  pause
  exit /b 1
)
set "DST=%APPDATA%\Adobe\CEP\extensions\CanvasFlowPanel"
xcopy "%SRC%" "%DST%" /E /I /Y >nul
if errorlevel 1 (
  echo [ERROR] Copy failed. Target: %DST%
  pause
  exit /b 1
)
for %%V in (9 10 11 12) do reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo Installed to: %DST%
echo Restart Photoshop, then open: Window - Extensions - "CanvasFlow" panel.
pause
