@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "DESKTOP_PROJECT=%PROJECT_ROOT%desktop-dotnet\CanvasFlow.Desktop.csproj"
set "PUBLISH_DIR=%PROJECT_ROOT%desktop-dotnet\bin\Release\net8.0-windows\win-x64\publish"

dotnet publish "%DESKTOP_PROJECT%" --configuration Release --runtime win-x64 --self-contained true --nologo
if errorlevel 1 exit /b 1

echo.
echo CanvasFlow publish folder:
echo %PUBLISH_DIR%
echo.
echo To create CanvasFlow-Setup.exe, compile installer\CanvasFlow.iss with Inno Setup 6.
exit /b 0
