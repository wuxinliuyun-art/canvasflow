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

rem -- Preset extension: image-to-pptx lives in the repo (extensions-presets\image-to-pptx) so CI builds the complete installer too; the large upscale one is distributed separately.
rem -- Keep this script pure ASCII: the Chinese display folder name and file names inside the preset are preserved by the filesystem, and the DestDir mapping lives in CanvasFlow.iss.
set "EXT_SOURCE=%PROJECT_ROOT%extensions-presets"
set "EXT_PRESETS=%PUBLISH_DIR%\extensions-presets"
if exist "%EXT_PRESETS%" rmdir /s /q "%EXT_PRESETS%"
if exist "%EXT_SOURCE%\image-to-pptx" (
  mkdir "%EXT_PRESETS%" 2>nul
  xcopy "%EXT_SOURCE%\image-to-pptx" "%EXT_PRESETS%\image-to-pptx\" /e /i /y >nul
  echo Preset extension copied: image-to-pptx
) else (
  echo [warn] preset extension not found: %EXT_SOURCE%\image-to-pptx
)

rem -- Release rule: ship an empty export folder, never pack user exports
if not exist "%PUBLISH_DIR%\export" mkdir "%PUBLISH_DIR%\export"

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

rem -- Version comes from package.json (single source of truth; the csproj reads the same file)
set "APP_VER="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -LiteralPath '%PROJECT_ROOT%package.json' -Raw | ConvertFrom-Json).version"`) do set "APP_VER=%%V"
if not defined APP_VER (
  echo Could not read version from package.json.
  exit /b 1
)

"%ISCC%" /DAppVersion=%APP_VER% "%PROJECT_ROOT%installer\CanvasFlow.iss"
if errorlevel 1 exit /b 1

rem -- Also keep a versioned copy next to the fixed-name installer for manual distribution
copy /y "%SETUP_FILE%" "%PROJECT_ROOT%dist-dotnet\CanvasFlow-Setup-%APP_VER%.exe" >nul

echo.
echo CanvasFlow installer:
echo %SETUP_FILE%
echo CanvasFlow installer (versioned copy):
echo %PROJECT_ROOT%dist-dotnet\CanvasFlow-Setup-%APP_VER%.exe
exit /b 0
