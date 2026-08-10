using System.Threading;
using System.Windows;

namespace CanvasFlow.Desktop;

public partial class App : Application
{
    private Mutex? _mutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        _mutex = new Mutex(true, "Local\\CanvasFlow.Desktop.Net8", out var first);
        if (!first)
        {
            MessageBox.Show("CanvasFlow 已经在运行。\n\n可能原因：现有窗口被最小化。\n建议办法：返回现有窗口继续操作。", "CanvasFlow");
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
