# CanvasFlow .NET 8 桌面面板

这是第一阶段迁移版本：WPF提供单窗口外壳，WebView2在窗口内加载现有画布，`server.js`作为隐藏后台进程运行。

```powershell
dotnet run --project .\desktop-dotnet\CanvasFlow.Desktop.csproj
```

需要.NET 8 Desktop Runtime、Microsoft Edge WebView2 Runtime和Node.js（第一阶段过渡依赖）。窗口关闭时会停止由它启动的Node子进程，数据继续使用项目根目录的`data`、`download`和`export`。

当前已实现单窗口、隐藏Node服务、内嵌画布、轻量启动提示、文件日志、单实例和退出清理。Node和WebView2会并行预热以缩短启动等待，运行日志写入`data/desktop.log`，不占用画布空间。Node API迁移、API Key安全存储、自动更新和安装程序留待后续阶段；Electron版本暂时作为回退。
