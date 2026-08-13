using System.Threading;
using System.Windows;
using System.IO;

namespace CanvasFlow.Desktop;

public partial class App : System.Windows.Application
{
    private Mutex? _mutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += (_, args) =>
        {
            try
            {
                var root = File.Exists(Path.Combine(Environment.CurrentDirectory, "index.html"))
                    ? Environment.CurrentDirectory : AppContext.BaseDirectory;
                Directory.CreateDirectory(Path.Combine(root, "data"));
                File.AppendAllText(Path.Combine(root, "data", "desktop.log"),
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [错误] [桌面未处理异常] {args.Exception}\r\n");
            }
            catch { }
            System.Windows.MessageBox.Show(
                $"CanvasFlow 遇到界面错误，但已阻止程序闪退。\n\n可能原因：窗口资源或图片预览加载异常。\n建议办法：关闭当前小窗口后重新打开。\n\n详细信息：{args.Exception.Message}",
                "CanvasFlow 界面错误", MessageBoxButton.OK, MessageBoxImage.Warning);
            args.Handled = true;
        };
        _mutex = new Mutex(true, "Local\\CanvasFlow.Desktop.Net8", out var first);
        if (!first)
        {
            System.Windows.MessageBox.Show("CanvasFlow 已经在运行。\n\n可能原因：现有窗口被最小化。\n建议办法：返回现有窗口继续操作。", "CanvasFlow");
            Shutdown();
            return;
        }
        base.OnStartup(e);
        new MainWindow().Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _mutex?.ReleaseMutex();
        _mutex?.Dispose();
        base.OnExit(e);
    }
}
