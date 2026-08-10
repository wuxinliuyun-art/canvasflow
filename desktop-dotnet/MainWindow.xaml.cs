using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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
    private bool _saveRequestStarted;
    private bool _canvasReady;
    private TaskCompletionSource<(bool Ok, string Error)>? _pageSaveCompletion;
    private readonly object _logLock = new();
    private readonly Dictionary<string, string> _folderSources = new(StringComparer.OrdinalIgnoreCase);

    private const string DesktopBridgeScript = """
      (() => {
        if (window.canvasflowDesktop || !window.chrome?.webview) return;
        let sequence = 0;
        const pending = new Map();
        const saveHandlers = [];
        const invoke = (type, payload = {}) => new Promise((resolve, reject) => {
          const requestId = `wpf_${Date.now()}_${++sequence}`;
          const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new Error("CanvasFlow desktop request timed out"));
          }, 15000);
          pending.set(requestId, { resolve, reject, timer });
          window.chrome.webview.postMessage({ type, requestId, ...payload });
        });
        window.chrome.webview.addEventListener("message", event => {
          const message = event.data || {};
          if (message.type === "desktop-rpc-result") {
            const request = pending.get(message.requestId);
            if (!request) return;
            clearTimeout(request.timer);
            pending.delete(message.requestId);
            if (message.ok === false) request.reject(new Error(message.error || "Desktop request failed"));
            else request.resolve(message.result || {});
          } else if (message.type === "desktop-save-request") {
            for (const callback of saveHandlers) callback(message);
          }
        });
        window.canvasflowDesktop = {
          isDesktop: true,
          getApiKey: () => invoke("desktop:get-api-key"),
          saveApiKey: apiKey => invoke("desktop:save-api-key", { apiKey: String(apiKey || "") }),
          onSaveRequest: callback => { if (typeof callback === "function") saveHandlers.push(callback); },
          completeSave: result => window.chrome.webview.postMessage({ type: "desktop:save-complete", ...(result || {}) }),
        };
      })();
      """;

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
            LoadFolderSources();
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
            CanvasView.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
            CanvasView.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
            CanvasView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            CanvasView.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                OpenExternalUrl(args.Uri);
            };
            CanvasView.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (IsCanvasUrl(args.Uri)) return;
                args.Cancel = true;
                OpenExternalUrl(args.Uri);
            };
            await CanvasView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(DesktopBridgeScript);
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
                    else if (type.GetString() == "desktop:get-api-key")
                    {
                        PostRpcResult(root, new { apiKey = ReadApiKey() });
                    }
                    else if (type.GetString() == "desktop:save-api-key")
                    {
                        var apiKey = root.TryGetProperty("apiKey", out var keyElement) ? keyElement.GetString() ?? "" : "";
                        try
                        {
                            SaveApiKey(apiKey);
                            PostRpcResult(root, new { saved = true, persistent = true });
                        }
                        catch (Exception saveError)
                        {
                            PostRpcResult(root, error: saveError.Message);
                        }
                    }
                    else if (type.GetString() == "desktop:save-complete")
                    {
                        var ok = root.TryGetProperty("ok", out var okElement) && okElement.GetBoolean();
                        var error = root.TryGetProperty("error", out var errorElement) ? errorElement.GetString() ?? "" : "";
                        _pageSaveCompletion?.TrySetResult((ok, error));
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

    private bool IsCanvasUrl(string value)
    {
        if (_serverUrl is null || !Uri.TryCreate(value, UriKind.Absolute, out var candidate) || !Uri.TryCreate(_serverUrl, UriKind.Absolute, out var canvas)) return false;
        return candidate.Scheme == canvas.Scheme && candidate.Host == canvas.Host && candidate.Port == canvas.Port;
    }

    private void OpenExternalUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)) return;
        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            Log($"[外部链接] 无法打开默认浏览器。可能原因：系统未设置默认浏览器。建议办法：复制链接后手动打开。详细信息：{error.Message}", true);
        }
    }

    private void PostRpcResult(JsonElement request, object? result = null, string? error = null)
    {
        var requestId = request.TryGetProperty("requestId", out var idElement) ? idElement.GetString() ?? "" : "";
        var payload = JsonSerializer.Serialize(new
        {
            type = "desktop-rpc-result",
            requestId,
            ok = string.IsNullOrEmpty(error),
            result,
            error = error ?? ""
        });
        CanvasView.CoreWebView2.PostWebMessageAsJson(payload);
    }

    private string SecretsPath => Path.Combine(_root!, "data", "secrets.json");
    private string FolderSourcesPath => Path.Combine(_root!, "data", "folder-sources.json");

    private void LoadFolderSources()
    {
        try
        {
            if (!File.Exists(FolderSourcesPath)) return;
            var saved = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(FolderSourcesPath, Encoding.UTF8));
            if (saved is null) return;
            foreach (var item in saved)
                if (Guid.TryParse(item.Key, out _) && Directory.Exists(item.Value)) _folderSources[item.Key] = Path.GetFullPath(item.Value);
        }
        catch (Exception error)
        {
            Log($"[文件夹来源] 读取登记信息失败。可能原因：配置文件损坏。建议办法：重新上传图片文件夹。详细信息：{error.Message}", true);
        }
    }

    private void SaveFolderSources()
    {
        var content = JsonSerializer.Serialize(_folderSources, new JsonSerializerOptions { WriteIndented = true });
        var temporary = FolderSourcesPath + $".{Environment.ProcessId}.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.tmp";
        File.WriteAllText(temporary, content, Encoding.UTF8);
        File.Move(temporary, FolderSourcesPath, true);
    }

    private string ReadApiKey()
    {
        try
        {
            if (!File.Exists(SecretsPath)) return "";
            using var document = JsonDocument.Parse(File.ReadAllText(SecretsPath, Encoding.UTF8));
            var encrypted = document.RootElement.TryGetProperty("apiKey", out var keyElement) ? keyElement.GetString() : null;
            if (string.IsNullOrWhiteSpace(encrypted)) return "";
            var protectedBytes = Convert.FromBase64String(encrypted);
            var bytes = ProtectedData.Unprotect(protectedBytes, Encoding.UTF8.GetBytes("CanvasFlow.ApiKey.v1"), DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }
        catch (Exception error)
        {
            Log($"[安全存储] API Key读取失败。可能原因：密钥属于其他Windows用户或文件损坏。建议办法：重新输入API Key。详细信息：{error.Message}", true);
            return "";
        }
    }

    private void SaveApiKey(string value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(SecretsPath)!);
        if (string.IsNullOrWhiteSpace(value))
        {
            if (File.Exists(SecretsPath)) File.Delete(SecretsPath);
            return;
        }
        var bytes = Encoding.UTF8.GetBytes(value.Trim());
        var protectedBytes = ProtectedData.Protect(bytes, Encoding.UTF8.GetBytes("CanvasFlow.ApiKey.v1"), DataProtectionScope.CurrentUser);
        var content = JsonSerializer.Serialize(new { version = 1, apiKey = Convert.ToBase64String(protectedBytes) }, new JsonSerializerOptions { WriteIndented = true });
        var temporary = SecretsPath + $".{Environment.ProcessId}.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.tmp";
        File.WriteAllText(temporary, content, Encoding.UTF8);
        File.Move(temporary, SecretsPath, true);
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
            var folderSourceId = Guid.NewGuid().ToString("N");
            _folderSources[folderSourceId] = Path.GetFullPath(picker.FolderName);
            SaveFolderSources();
            var payload = JsonSerializer.Serialize(new { type = "image-folder-selected", folderName, folderSourceId });
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
            var sourceId = message.GetProperty("sourceId").GetString() ?? "";
            var relativePath = message.GetProperty("relativePath").GetString() ?? "";
            if (!_folderSources.TryGetValue(sourceId, out var registeredFolder))
                throw new UnauthorizedAccessException("图片来源没有经过CanvasFlow登记，请重新上传文件夹");
            var folderRoot = Path.GetFullPath(registeredFolder).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
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
                _canvasReady = true;
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
        if (_saveRequestStarted) return;
        _saveRequestStarted = true;

        var saveResult = await RequestPageSaveAsync();
        if (!saveResult.Ok)
        {
            _saveRequestStarted = false;
            Show();
            Activate();
            MessageBox.Show(
                $"项目没有成功保存，因此CanvasFlow没有退出。\n\n可能原因：数据目录无写入权限或页面暂时无响应。\n建议办法：确认磁盘和目录权限后再次关闭。\n\n详细信息：{saveResult.Error}",
                "CanvasFlow 保存失败",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

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

    private async Task<(bool Ok, string Error)> RequestPageSaveAsync()
    {
        if (!_canvasReady || CanvasView.CoreWebView2 is null) return (true, "");
        _pageSaveCompletion = new TaskCompletionSource<(bool Ok, string Error)>(TaskCreationOptions.RunContinuationsAsynchronously);
        var requestId = $"close_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        CanvasView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
        {
            type = "desktop-save-request",
            requestId,
            reason = "window-close"
        }));
        var completed = await Task.WhenAny(_pageSaveCompletion.Task, Task.Delay(TimeSpan.FromSeconds(15)));
        if (completed != _pageSaveCompletion.Task)
        {
            _pageSaveCompletion = null;
            return (false, "等待页面保存确认超过15秒");
        }
        var result = await _pageSaveCompletion.Task;
        _pageSaveCompletion = null;
        return result;
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
