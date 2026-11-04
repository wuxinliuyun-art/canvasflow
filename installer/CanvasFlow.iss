#define AppName "CanvasFlow"
; -- AppVersion is passed by build-dotnet.cmd as /DAppVersion=<package.json version>;
; -- the fallback below only covers a bare ISCC run.
#ifndef AppVersion
  #define AppVersion "2.7.1"
#endif
#ifndef PublishDir
  #define PublishDir "..\desktop-dotnet\bin\Release\net10.0-windows\win-x64\publish"
#endif

[Setup]
AppId={{B42B4F53-A7D4-4F37-8FB4-25EF8AF0CF31}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=wuxinliuyun-art
AppPublisherURL=https://github.com/wuxinliuyun-art/canvasflow
DefaultDirName={code:GetDefaultInstallDir}
UsePreviousAppDir=yes
DisableDirPage=no
DefaultGroupName=CanvasFlow
OutputDir=..\dist-dotnet
OutputBaseFilename=CanvasFlow-Setup
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\app\CanvasFlow.exe
WizardStyle=modern
SetupIconFile=..\assets\canvasflow.ico

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}\app"; Excludes: "extensions-presets\*,export\*,data\*,download\*,projects\*,cs\*,de\*,es\*,fr\*,it\*,ja\*,ko\*,pl\*,pt-BR\*,ru\*,tr\*,zh-Hant\*,*.pdb,*.xml,*.lib"; Flags: ignoreversion recursesubdirs createallsubdirs
; -- 预制拓展（image-to-pptx，安装目录名保持「图片置入pptx」）。
Source: "{#PublishDir}\extensions-presets\图片置入ppt\*"; DestDir: "{app}\拓展\图片置入pptx"; Excludes: "_work\*,_staging\*,_upscale_tmp\*,*.log,*.pyc,__pycache__\*"; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall
Source: "..\拓展脚本规范.md"; DestDir: "{app}\拓展"; Flags: ignoreversion uninsneveruninstall
Source: "{#PublishDir}\extensions-presets\自动抠图-U2Net\*"; DestDir: "{app}\拓展\自动抠图-U2Net"; Excludes: "input\*,output\*,_work\*,params.json,*.log,*.pyc,__pycache__\*"; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall
Source: "{#PublishDir}\extensions-presets\图片矢量化\*"; DestDir: "{app}\拓展\图片矢量化"; Excludes: "input\*,output\*,*.log,*.pyc,__pycache__\*"; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall

; Program files are replaced by [Files]. Keep legacy folders and all user documents.

[InstallDelete]
; Only clear reserved frontend resources so removed scripts cannot survive an upgrade.
Type: files; Name: "{app}\app\*.js"
Type: files; Name: "{app}\app\*.html"
Type: files; Name: "{app}\app\*.css"
Type: filesandordirs; Name: "{app}\app\modules"

[Code]
function GetDefaultInstallDir(Param: String): String;
begin
  if DirExists('D:\') then
    Result := 'D:\CanvasFlow'
  else
    Result := ExpandConstant('{localappdata}\Programs\CanvasFlow');
end;

[Dirs]
Name: "{app}\拓展"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\data"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\download"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\export"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\projects"; Permissions: users-modify; Flags: uninsneveruninstall
; Preserve exports saved beside the executable by older versions or custom paths.
Name: "{app}\app\export"; Permissions: users-modify; Flags: uninsneveruninstall

[Icons]
Name: "{autodesktop}\CanvasFlow"; Filename: "{app}\app\CanvasFlow.exe"; IconFilename: "{app}\app\CanvasFlow.exe"; WorkingDir: "{app}"
Name: "{group}\CanvasFlow"; Filename: "{app}\app\CanvasFlow.exe"; IconFilename: "{app}\app\CanvasFlow.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\app\CanvasFlow.exe"; WorkingDir: "{app}"; Description: "启动 CanvasFlow"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Installed files are removed using Inno Setup's uninstall log.
; Never delete by wildcard or recurse through user data, exports or extensions.
Type: dirifempty; Name: "{app}\app"
