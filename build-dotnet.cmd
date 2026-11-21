@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "DESKTOP_PROJECT=%PROJECT_ROOT%desktop-dotnet\CanvasFlow.Desktop.csproj"
set "MCP_PROJECT=%PROJECT_ROOT%integrations\canvasflow-mcp\CanvasFlow.Mcp.csproj"
set "PUBLISH_DIR=%PROJECT_ROOT%desktop-dotnet\bin\Release\net10.0-windows\win-x64\publish"
set "MCP_PUBLISH_DIR=%PUBLISH_DIR%\mcp"
set "SETUP_FILE=%PROJECT_ROOT%dist-dotnet\CanvasFlow-Setup.exe"
set "ISCC="

dotnet restore "%DESKTOP_PROJECT%" --runtime win-x64 --nologo
if errorlevel 1 exit /b 1

if exist "%PUBLISH_DIR%" rmdir /s /q "%PUBLISH_DIR%"
dotnet publish "%DESKTOP_PROJECT%" --configuration Release --runtime win-x64 --self-contained true --no-restore --nologo
if errorlevel 1 exit /b 1

dotnet restore "%MCP_PROJECT%" --runtime win-x64 --nologo
if errorlevel 1 exit /b 1
dotnet publish "%MCP_PROJECT%" --configuration Release --runtime win-x64 --self-contained true --output "%MCP_PUBLISH_DIR%" --no-restore --nologo
if errorlevel 1 exit /b 1

for %%L in (cs de es fr it ja ko pl pt-BR ru tr zh-Hant) do if exist "%PUBLISH_DIR%\%%L" rmdir /s /q "%PUBLISH_DIR%\%%L"

rem -- Extension preset folders are intentionally NOT copied into publish anymore (2026-11-21):
rem -- CanvasFlow.iss excludes extensions-presets from the installer (extensions ship independently),
rem -- and AV software silently kills the whole console process when runtime DLLs (concrt140/msvcp140/
rem -- vcruntime140 family) are written into the publish tree, aborting the build with exit 0.
rem -- Only the authoring spec (root-level .md) is staged for the installer to pack.
set "EXT_SOURCE=%PROJECT_ROOT%extensions-presets"
set "EXT_PRESETS=%PUBLISH_DIR%\extensions-presets"
if exist "%EXT_PRESETS%" rmdir /s /q "%EXT_PRESETS%"
if not exist "%EXT_PRESETS%" mkdir "%EXT_PRESETS%"
rem -- Ship the extension authoring spec (root-level .md files) with the presets.
if exist "%EXT_SOURCE%\*.md" copy /y "%EXT_SOURCE%\*.md" "%EXT_PRESETS%\" >nul
if errorlevel 1 exit /b 1

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
