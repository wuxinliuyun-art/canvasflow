#define AppName "CanvasFlow"
#define AppVersion "2.6.0"
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
UninstallDisplayIcon={app}\CanvasFlow.exe
WizardStyle=modern
SetupIconFile=..\assets\canvasflow.ico

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\download"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\export"; Permissions: users-modify; Flags: uninsneveruninstall

[Icons]
Name: "{autodesktop}\CanvasFlow"; Filename: "{app}\CanvasFlow.exe"
Name: "{group}\CanvasFlow"; Filename: "{app}\CanvasFlow.exe"

[Run]
Filename: "{app}\CanvasFlow.exe"; Description: "启动 CanvasFlow"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data\webview2"
