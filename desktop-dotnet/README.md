# CanvasFlow .NET 10 桌面版

WPF提供单窗口外壳，WebView2在窗口内加载现有画布。本地文件与联网接口直接由.NET处理，不启动Node服务、不监听本地端口。

```powershell
dotnet run --project .\desktop-dotnet\CanvasFlow.Desktop.csproj
```

源码运行需要.NET 10 SDK和Microsoft Edge WebView2 Runtime，不需要Node.js。正式安装包使用自包含.NET发布，用户无需另装.NET；Windows 10/11通常已包含WebView2 Runtime。

运行项目根目录的`build-dotnet.cmd`可依次生成.NET 10自包含发布目录和`dist-dotnet\CanvasFlow-Setup.exe`。生成安装包需要开发电脑安装Inno Setup 6，最终用户不需要安装该工具。

用户数据位于程序旁的`data`、`download`和`export`，运行日志写入`data/desktop.log`。API Key通过Windows DPAPI按当前用户加密；退出前会等待项目状态与自动备份写入成功。
