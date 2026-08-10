using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;

namespace CanvasFlow.Desktop;

public partial class MainWindow : Window
{
    private const int DwmUseImmersiveDarkMode = 20;
    private const int DwmCaptionColor = 35;
    private const int DwmTextColor = 36;
    // COLORREF is stored as 0x00BBGGRR. Keep the native title bar distinct from the canvas.
    private const int DarkCaptionColor = 0x00151312;  // RGB #121315
    private const int LightCaptionColor = 0x00EEEBE9; // RGB #E9EBEE
    private const int LightTextColor = 0x00FFFFFF;
    private const int DarkTextColor = 0x00262220;
    private static readonly Regex ServerUrlPattern = new(@"\[Start\] CanvasFlow server: (?<url>http://127\.0\.0\.1:\d+/)", RegexOptions.Compiled);
    private readonly CancellationTokenSource _shutdown = new();
    private Process? _node;
    private CoreWebView2Environment? _webViewEnvironment;
    private string? _serverUrl;
    private string? _root;
    private bool _closing;
    private bool _shutdownComplete;
    private readonly object _logLock = new();

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
        Closed += (_, _) => Application.Current.Shutdown();
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        ApplyTitleBarColors(true);
    }

    private void ApplyTitleBarColors(bool dark)
    {
        var handle = new WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return;
        var darkMode = dark ? 1 : 0;
        var captionColor = dark ? DarkCaptionColor : LightCaptionColor;
        var textColor = dark ? LightTextColor : DarkTextColor;
        DwmSetWindowAttribute(handle, DwmUseImmersiveDarkMode, ref darkMode, sizeof(int));
        DwmSetWindowAttribute(handle, DwmCaptionColor, ref captionColor, sizeof(int));
        DwmSetWindowAttribute(handle, DwmTextColor, ref textColor, sizeof(int));
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr windowHandle, int attribute, ref int value, int valueSize);

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            _root = FindProjectRoot();
            foreach (var name in new[] { "data", "download", "export" }) Directory.CreateDirectory(Path.Combine(_root, name));
            Log("[启动] 已找到项目目录。", false);
            var nodeTask = StartNodeAsync(_root, _shutdown.Token);
            var webViewTask = InitializeWebViewAsync(_shutdown.Token);
            await Task.WhenAll(nodeTask, webViewTask);
            NavigateCanvas();
        }
        catch (OperationCanceledException) when (_shutdown.IsCancellationRequested) { }
        catch (Exception ex) { ShowFailure(ex); }
    }

    private static string FindProjectRoot()
    {
        var candidates = new[]
        {
            AppContext.BaseDirectory,
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..")),
            Environment.CurrentDirectory
        };
        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
            if (File.Exists(Path.Combine(candidate, "server.js")) && File.Exists(Path.Combine(candidate, "index.html"))) return candidate;
        throw new DirectoryNotFoundException("没有找到server.js和index.html。可能原因：程序被单独复制到项目之外。建议办法：从项目根目录构建或启动.NET桌面版。");
    }

    private async Task StartNodeAsync(string root, CancellationToken cancellationToken)
    {
        StatusText.Text = "正在启动后台服务…";
        var info = new ProcessStartInfo
        {
            FileName = "node.exe", Arguments = "server.js", WorkingDirectory = root,
            UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        _node = new Process { StartInfo = info, EnableRaisingEvents = true };
        _node.OutputDataReceived += (_, e) => HandleLine(e.Data, false);
        _node.ErrorDataReceived += (_, e) => HandleLine(e.Data, true);
        _node.Exited += (_, _) => Dispatcher.Invoke(() =>
        {
            if (_closing) return;
            StatusText.Text = "后台服务已停止";
            Log("[错误] Node后台服务意外停止。可能原因：端口、文件或Node环境异常。建议办法：查看日志后重启程序。", true);
        });
        try
        {
            if (!_node.Start()) throw new InvalidOperationException("Node进程未能启动。");
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"无法启动隐藏的Node后台服务。可能原因：Node.js未安装或未加入PATH。建议办法：确认node --version可以运行。详细信息：{ex.Message}", ex);
        }
        _node.BeginOutputReadLine();
        _node.BeginErrorReadLine();

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            while (_serverUrl is null)
            {
                if (_node.HasExited) throw new InvalidOperationException("Node后台服务在返回地址前退出。可能原因：启动脚本异常。建议办法：查看运行日志。");
                await Task.Delay(100, timeout.Token);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("后台服务启动超过15秒。可能原因：端口或Node异常。建议办法：查看日志并检查5173附近端口。");
        }
    }

    private void HandleLine(string? line, bool error)
    {
        if (string.IsNullOrWhiteSpace(line)) return;
        var match = ServerUrlPattern.Match(line);
        if (match.Success) _serverUrl = match.Groups["url"].Value;
        Dispatcher.Invoke(() => Log(line, error));
    }

    private async Task InitializeWebViewAsync(CancellationToken cancellationToken)
    {
        StatusText.Text = "正在加载画布…";
        try
        {
            _webViewEnvironment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(_root!, "data", "webview2"));
            await CanvasView.EnsureCoreWebView2Async(_webViewEnvironment);
            CanvasView.CoreWebView2.WebMessageReceived += async (_, e) =>
            {
                try
                {
                    using var message = System.Text.Json.JsonDocument.Parse(e.WebMessageAsJson);
                    var root = message.RootElement;
                    if (!root.TryGetProperty("type", out var type)) return;
                    if (type.GetString() == "theme-change" && root.TryGetProperty("theme", out var theme))
                    {
                        var dark = theme.GetString() == "dark";
                        Dispatcher.Invoke(() => ApplyTitleBarColors(dark));
                        Log($"[主题] 标题栏已切换为{(dark ? "深色" : "浅色")}模式。", false);
                    }
                    else if (type.GetString() == "pick-image-folder")
                    {
                        await PickImageFolderAsync();
                    }
                    else if (type.GetString() == "read-local-image")
                    {
                        await ReadLocalImageAsync(root);
                    }
                }
                catch (Exception messageError)
                {
                    Log($"[页面通信] 无法处理网页消息。可能原因：消息格式发生变化。建议办法：重新打开应用；详细信息：{messageError.Message}", true);
                }
            };
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"WebView2初始化失败。可能原因：WebView2 Runtime缺失或data目录无权限。建议办法：安装WebView2 Runtime并确认目录可写。详细信息：{ex.Message}", ex);
        }
        cancellationToken.ThrowIfCancellationRequested();
    }

    private Task PickImageFolderAsync()
    {
        try
        {
            var picker = new Microsoft.Win32.OpenFolderDialog
            {
                Title = "选择图片文件夹",
                Multiselect = false
            };
            if (picker.ShowDialog(this) != true) return Task.CompletedTask;
            if (_webViewEnvironment is null) throw new InvalidOperationException("WebView2 环境尚未准备完成");
            var directoryHandle = _webViewEnvironment.CreateWebFileSystemDirectoryHandle(
                picker.FolderName,
                CoreWebView2FileSystemHandlePermission.ReadOnly);
            var folderName = Path.GetFileName(picker.FolderName.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            var payload = System.Text.Json.JsonSerializer.Serialize(new { type = "image-folder-selected", folderName, folderPath = picker.FolderName });
            CanvasView.CoreWebView2.PostWebMessageAsJson(payload, new List<object> { directoryHandle });
        }
        catch (Exception error)
        {
            Log($"[文件夹上传] 无法打开或读取文件夹。可能原因：目录权限不足或选择器异常。建议办法：换一个普通图片目录后重试。详细信息：{error.Message}", true);
            var payload = System.Text.Json.JsonSerializer.Serialize(new { type = "image-folder-error", error = error.Message });
            CanvasView.CoreWebView2.PostWebMessageAsJson(payload);
        }
        return Task.CompletedTask;
    }

    private async Task ReadLocalImageAsync(System.Text.Json.JsonElement message)
    {
        var requestId = message.TryGetProperty("requestId", out var requestElement) ? requestElement.GetString() ?? "" : "";
        try
        {
            var folderPath = message.GetProperty("folderPath").GetString() ?? "";
            var relativePath = message.GetProperty("relativePath").GetString() ?? "";
            var folderRoot = Path.GetFullPath(folderPath).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var filePath = Path.GetFullPath(Path.Combine(folderRoot, relativePath));
            if (!filePath.StartsWith(folderRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new UnauthorizedAccessException("图片路径超出了已选择的文件夹");
            var extension = Path.GetExtension(filePath).ToLowerInvariant();
            var mime = extension switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                ".gif" => "image/gif",
                _ => throw new InvalidDataException("文件不是支持的图片格式")
            };
            var bytes = await File.ReadAllBytesAsync(filePath, _shutdown.Token);
            var payload = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "local-image-result",
                requestId,
                dataUrl = $"data:{mime};base64,{Convert.ToBase64String(bytes)}"
            });
            CanvasView.CoreWebView2.PostWebMessageAsJson(payload);
        }
        catch (Exception error)
        {
            Log($"[本地图片] 无法读取原图。可能原因：文件夹被移动、图片被删除或权限不足。建议办法：恢复原文件位置或重新上传文件夹。详细信息：{error.Message}", true);
            var payload = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "local-image-result",
                requestId,
                error = error.Message
            });
            CanvasView.CoreWebView2.PostWebMessageAsJson(payload);
        }
    }

    private void NavigateCanvas()
    {
        CanvasView.CoreWebView2.NavigationCompleted += (_, e) =>
        {
            if (e.IsSuccess)
            {
                StartupOverlay.Visibility = Visibility.Collapsed;
                Log($"[画布] 加载完成：{_serverUrl}", false);
            }
            else
            {
                StatusText.Text = "画布加载失败";
                Log($"[错误] 画布加载失败：{e.WebErrorStatus}", true);
            }
        };
        CanvasView.Source = new Uri(_serverUrl!);
    }

    private void ShowFailure(Exception ex)
    {
        StatusText.Text = "启动失败";
        Log($"[错误] {ex.Message}", true);
        MessageBox.Show(ex.Message, "CanvasFlow 启动失败", MessageBoxButton.OK, MessageBoxImage.Error);
    }

    private void Log(string message, bool error)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {(error ? "[错误] " : "")}{message}";
        Debug.WriteLine(line);
        if (_root is null) return;
        lock (_logLock)
        {
            File.AppendAllText(Path.Combine(_root, "data", "desktop.log"), line + Environment.NewLine, Encoding.UTF8);
        }
    }

    private async void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_shutdownComplete) return;
        e.Cancel = true;
        _closing = true;
        Hide();
        _shutdown.Cancel();
        _ = Task.Run(async () =>
        {
            await Task.Delay(TimeSpan.FromSeconds(3));
            Environment.Exit(0);
        });
        try
        {
            await Task.Run(StopNode);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[关闭] 清理桌面资源失败：{ex.Message}");
        }
        finally
        {
            _shutdownComplete = true;
            Environment.Exit(0);
        }
    }

    private void StopNode()
    {
        var process = _node;
        _node = null;
        if (process is null) return;
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[关闭] 停止Node服务失败：{ex.Message}");
        }
        finally
        {
            process.Dispose();
        }
    }
}
