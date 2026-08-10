@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "DESKTOP_PROJECT=%PROJECT_ROOT%desktop-dotnet\CanvasFlow.Desktop.csproj"
set "DESKTOP_EXE=%PROJECT_ROOT%desktop-dotnet\bin\Debug\net8.0-windows\CanvasFlow.Desktop.exe"

if not exist "%DESKTOP_PROJECT%" (
  echo [ERROR] CanvasFlow .NET desktop project was not found.
  echo Cause: This launcher is not in the CanvasFlow project root.
  echo Fix: Move the launcher back to the webimage-pkg2.3 folder.
  pause
  exit /b 1
)

dotnet build "%DESKTOP_PROJECT%" --configuration Debug --no-restore --nologo --verbosity quiet
if errorlevel 1 (
  echo.
  echo [ERROR] The .NET desktop build failed.
  echo Cause: .NET 8 SDK is missing or packages were not restored.
  echo Fix: Run dotnet restore for the desktop project and try again.
  pause
  exit /b 1
)

start "" /D "%PROJECT_ROOT%" "%DESKTOP_EXE%"
exit /b 0
