@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "DESKTOP_PROJECT=%PROJECT_ROOT%desktop-dotnet\CanvasFlow.Desktop.csproj"
set "PUBLISH_DIR=%PROJECT_ROOT%desktop-dotnet\bin\Release\net10.0-windows\win-x64\publish"
set "SETUP_FILE=%PROJECT_ROOT%dist-dotnet\CanvasFlow-Setup.exe"
set "ISCC="

dotnet publish "%DESKTOP_PROJECT%" --configuration Release --runtime win-x64 --self-contained true --nologo
if errorlevel 1 exit /b 1

echo.
echo CanvasFlow publish folder:
echo %PUBLISH_DIR%
echo.
if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"

if not defined ISCC (
  echo Inno Setup 6 was not found. Publish folder is ready, but the installer was not created.
  exit /b 2
)

"%ISCC%" "%PROJECT_ROOT%installer\CanvasFlow.iss"
if errorlevel 1 exit /b 1

echo.
echo CanvasFlow installer:
echo %SETUP_FILE%
exit /b 0
