#define AppName "CanvasFlow"
#define AppVersion "2.6.4"
#define PublishDir "..\desktop-dotnet\bin\Release\net10.0-windows\win-x64\publish"

[Setup]
AppId={{B42B4F53-A7D4-4F37-8FB4-25EF8AF0CF31}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=wuxinliuyun-art
AppPublisherURL=https://github.com/wuxinliuyun-art/canvasflow
DefaultDirName={localappdata}\Programs\CanvasFlow
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
Source: "{#PublishDir}\*"; DestDir: "{app}\app"; Excludes: "cs\*,de\*,es\*,fr\*,it\*,ja\*,ko\*,pl\*,pt-BR\*,ru\*,tr\*,zh-Hant\*,*.pdb,*.xml,*.lib"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: files; Name: "{app}\*.dll"
Type: files; Name: "{app}\*.exe"
Type: files; Name: "{app}\*.json"
Type: files; Name: "{app}\*.js"
Type: files; Name: "{app}\*.css"
Type: files; Name: "{app}\*.html"
Type: files; Name: "{app}\*.pdb"
Type: files; Name: "{app}\*.xml"
Type: files; Name: "{app}\LICENSE"
Type: filesandordirs; Name: "{app}\assets"
Type: filesandordirs; Name: "{app}\modules"
Type: filesandordirs; Name: "{app}\plugins"
Type: filesandordirs; Name: "{app}\runtimes"
Type: filesandordirs; Name: "{app}\workers"
Type: filesandordirs; Name: "{app}\cs"
Type: filesandordirs; Name: "{app}\de"
Type: filesandordirs; Name: "{app}\es"
Type: filesandordirs; Name: "{app}\fr"
Type: filesandordirs; Name: "{app}\it"
Type: filesandordirs; Name: "{app}\ja"
Type: filesandordirs; Name: "{app}\ko"
Type: filesandordirs; Name: "{app}\pl"
Type: filesandordirs; Name: "{app}\pt-BR"
Type: filesandordirs; Name: "{app}\ru"
Type: filesandordirs; Name: "{app}\tr"
Type: filesandordirs; Name: "{app}\zh-Hans"
Type: filesandordirs; Name: "{app}\zh-Hant"

[Dirs]
Name: "{app}\data"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\download"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\export"; Permissions: users-modify; Flags: uninsneveruninstall

[Icons]
Name: "{autodesktop}\CanvasFlow"; Filename: "{app}\app\CanvasFlow.exe"; WorkingDir: "{app}"
Name: "{group}\CanvasFlow"; Filename: "{app}\app\CanvasFlow.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\app\CanvasFlow.exe"; WorkingDir: "{app}"; Description: "启动 CanvasFlow"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data\webview2"
Type: filesandordirs; Name: "{app}\app"
Type: files; Name: "{app}\*.dll"
Type: files; Name: "{app}\*.exe"
Type: files; Name: "{app}\*.json"
Type: files; Name: "{app}\*.js"
Type: files; Name: "{app}\*.css"
Type: files; Name: "{app}\*.html"
Type: files; Name: "{app}\*.pdb"
Type: files; Name: "{app}\*.xml"
Type: files; Name: "{app}\LICENSE"
Type: filesandordirs; Name: "{app}\assets"
Type: filesandordirs; Name: "{app}\modules"
Type: filesandordirs; Name: "{app}\plugins"
Type: filesandordirs; Name: "{app}\runtimes"
Type: filesandordirs; Name: "{app}\workers"
Type: filesandordirs; Name: "{app}\cs"
Type: filesandordirs; Name: "{app}\de"
Type: filesandordirs; Name: "{app}\es"
Type: filesandordirs; Name: "{app}\fr"
Type: filesandordirs; Name: "{app}\it"
Type: filesandordirs; Name: "{app}\ja"
Type: filesandordirs; Name: "{app}\ko"
Type: filesandordirs; Name: "{app}\pl"
Type: filesandordirs; Name: "{app}\pt-BR"
Type: filesandordirs; Name: "{app}\ru"
Type: filesandordirs; Name: "{app}\tr"
Type: filesandordirs; Name: "{app}\zh-Hans"
Type: filesandordirs; Name: "{app}\zh-Hant"
