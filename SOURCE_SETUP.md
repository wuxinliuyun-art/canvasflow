# CanvasFlow 源码运行说明

本页面向需要修改或自行构建 CanvasFlow 的开发者；普通用户只需下载 GitHub Release 中的 `CanvasFlow-Setup.exe`。

## .NET桌面版环境

- Windows 10/11 x64
- .NET 8 SDK（仅源码运行和构建需要）
- Microsoft Edge WebView2 Runtime
- Inno Setup 6（仅生成`CanvasFlow-Setup.exe`时需要）
- 首次还原NuGet依赖和检查更新时需要联网

正式安装包为自包含.NET x64版本，普通用户无需安装.NET SDK、Node.js或Electron。

## 桌面版源码运行

```powershell
dotnet run --project .\desktop-dotnet\CanvasFlow.Desktop.csproj
```

也可以双击项目根目录的`启动CanvasFlow-NET.bat`。源码模式下，`data`、`download`和`export`位于项目根目录并已被Git忽略。

## 浏览器兼容模式

```powershell
node server.js
```

浏览器兼容模式需要Node.js 22 LTS，然后打开终端中显示的本地地址。它仅用于开发兼容，不是正式桌面发行方式。

## 构建 Windows 安装包

```powershell
.\build-dotnet.cmd
```

自包含发布目录位于`desktop-dotnet\bin\Release\net8.0-windows\win-x64\publish`。随后用Inno Setup 6编译`installer\CanvasFlow.iss`，输出`dist-dotnet\CanvasFlow-Setup.exe`。

安装包为Windows x64当前用户安装，不需要管理员权限；当前没有商业代码签名。

## 数据与发布

- 不要提交`data/`、`download/`、`export/`、`dist-dotnet/`或任何EXE。
- GitHub Release 只手工上传 `CanvasFlow-Setup.exe`。
- 发布前检查publish目录包含`CanvasFlow.exe`、`index.html`、`app.js`和`styles.css`。
- 安装和更新测试必须确认 `data`、`download`、`export` 不被覆盖或删除。
