@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "DESKTOP_PROJECT=%PROJECT_ROOT%desktop-dotnet\CanvasFlow.Desktop.csproj"
set "DESKTOP_EXE=%PROJECT_ROOT%desktop-dotnet\bin\Debug\net10.0-windows\win-x64\CanvasFlow.exe"

if not exist "%DESKTOP_PROJECT%" (
  echo [ERROR] CanvasFlow .NET desktop project was not found.
  echo Cause: This launcher is not in the CanvasFlow project root.
  echo Fix: Move the launcher back to the webimage-pkg2.3 folder.
  pause
  exit /b 1
)

dotnet restore "%DESKTOP_PROJECT%" --runtime win-x64 --nologo --verbosity quiet
if errorlevel 1 (
  echo.
  echo [ERROR] The .NET desktop dependencies could not be restored.
  echo Cause: The win-x64 runtime package is missing, or NuGet is temporarily unavailable.
  echo Fix: Check the network connection and retry. Existing project data is not affected.
  pause
  exit /b 1
)

dotnet build "%DESKTOP_PROJECT%" --configuration Debug --runtime win-x64 --no-restore --nologo --verbosity quiet
if errorlevel 1 (
  echo.
  echo [ERROR] The .NET desktop build failed.
  echo Cause: A source file or dependency could not be compiled.
  echo Fix: Review the detailed build error above and retry after correcting it.
  pause
  exit /b 1
)

if not exist "%DESKTOP_EXE%" (
  echo.
  echo [ERROR] CanvasFlow desktop executable was not generated.
  echo Cause: The build output path may have changed.
  echo Fix: Check the desktop-dotnet\bin\Debug\net10.0-windows\win-x64 folder.
  pause
  exit /b 1
)

start "" /D "%PROJECT_ROOT%" "%DESKTOP_EXE%"
exit /b 0
