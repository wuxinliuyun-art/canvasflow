using System.Threading;
using System.Windows;
using System.IO;

namespace CanvasFlow.Desktop;

public partial class App : System.Windows.Application
{
    private Mutex? _mutex;
    private bool _ownsMutex;
    private EventWaitHandle? _activateEvent;

    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += (_, args) =>
        {
            try
            {
                var baseDirectory = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
                var root = string.Equals(Path.GetFileName(baseDirectory), "app", StringComparison.OrdinalIgnoreCase)
                    ? Directory.GetParent(baseDirectory)?.FullName ?? baseDirectory
                    : File.Exists(Path.Combine(Environment.CurrentDirectory, "index.html")) ? Environment.CurrentDirectory : baseDirectory;
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
        _ownsMutex = first;
        if (!first)
        {
            // 已有实例在运行：发激活信号让现有窗口到前台，不再弹窗打扰
            try
            {
                using var activate = System.Threading.EventWaitHandle.OpenExisting("Local\\CanvasFlow.Desktop.Activate");
                activate.Set();
            }
            catch (System.Threading.WaitHandleCannotBeOpenedException) { }
            Shutdown();
            return;
        }
        StartActivationListener();
        base.OnStartup(e);
        new MainWindow().Show();
    }

    private void StartActivationListener()
    {
        _activateEvent = new EventWaitHandle(false, System.Threading.EventResetMode.AutoReset, "Local\\CanvasFlow.Desktop.Activate", out _);
        var listener = new Thread(() =>
        {
            while (_activateEvent.WaitOne())
            {
                Dispatcher.Invoke(ShowExistingWindow);
            }
        })
        { IsBackground = true };
        listener.Start();
    }

    private void ShowExistingWindow()
    {
        var window = System.Windows.Application.Current?.MainWindow;
        if (window is null) return;
        if (window.WindowState == WindowState.Minimized) window.WindowState = WindowState.Normal;
        window.Show();
        window.Activate();
        window.Topmost = true;
        window.Topmost = false;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _activateEvent?.Dispose();
        if (_ownsMutex) _mutex?.ReleaseMutex();
        _mutex?.Dispose();
        base.OnExit(e);
    }
}
