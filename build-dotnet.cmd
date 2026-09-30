@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "DESKTOP_PROJECT=%PROJECT_ROOT%desktop-dotnet\CanvasFlow.Desktop.csproj"
set "PUBLISH_DIR=%PROJECT_ROOT%desktop-dotnet\bin\Release\net10.0-windows\win-x64\publish"
set "SETUP_FILE=%PROJECT_ROOT%dist-dotnet\CanvasFlow-Setup.exe"
set "ISCC="

dotnet restore "%DESKTOP_PROJECT%" --runtime win-x64 --nologo
if errorlevel 1 exit /b 1

if exist "%PUBLISH_DIR%" rmdir /s /q "%PUBLISH_DIR%"
dotnet publish "%DESKTOP_PROJECT%" --configuration Release --runtime win-x64 --self-contained true --no-restore --nologo
if errorlevel 1 exit /b 1

for %%L in (cs de es fr it ja ko pl pt-BR ru tr zh-Hant) do if exist "%PUBLISH_DIR%\%%L" rmdir /s /q "%PUBLISH_DIR%\%%L"

rem -- Preset extension: ship only image-to-pptx with 2.7.0; the large upscale one is distributed separately
set "EXT_SOURCE=%PROJECT_ROOT%..\ÍØÕ¹"
set "EXT_PRESETS=%PUBLISH_DIR%\extensions-presets"
if exist "%EXT_PRESETS%" rmdir /s /q "%EXT_PRESETS%"
if exist "%EXT_SOURCE%\Í¼Æ¬ÖÃÈëpptx" (
  mkdir "%EXT_PRESETS%" 2>nul
  xcopy "%EXT_SOURCE%\Í¼Æ¬ÖÃÈëpptx" "%EXT_PRESETS%\Í¼Æ¬ÖÃÈëpptx\" /e /i /y >nul
  echo Preset extension copied: image-to-pptx
) else (
  echo [warn] preset extension not found: %EXT_SOURCE%\image-to-pptx-dir
)

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
