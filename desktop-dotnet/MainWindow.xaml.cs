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
    private const string CanvasUrl = "https://canvasflow.local/index.html";
    private readonly CancellationTokenSource _shutdown = new();
    private DesktopApi? _desktopApi;
    private BackgroundRemovalPlugin? _backgroundRemovalPlugin;
    private ScreenshotToolWindow? _screenshotToolWindow;
    private CoreWebView2Environment? _webViewEnvironment;
    private string? _root;
    private string? _contentRoot;
    private bool _shutdownComplete;
    private bool _saveRequestStarted;
    private bool _canvasReady;
    private bool _darkTheme = true;
    private TaskCompletionSource<(bool Ok, string Error)>? _pageSaveCompletion;
    private readonly object _logLock = new();
    private readonly object _assetLock = new();
    private readonly Dictionary<string, AssetRecord> _assets = new(StringComparer.OrdinalIgnoreCase);

    private sealed class AssetRecord
    {
        public string Id { get; set; } = "";
        public string FileName { get; set; } = "";
        public string Mime { get; set; } = "image/png";
        public string RelativePath { get; set; } = "";
        public long Size { get; set; }
    }

    private const string DesktopBridgeScript = """
      (() => {
        if (window.canvasflowDesktop || !window.chrome?.webview) return;
        let sequence = 0;
        const pending = new Map();
        const saveHandlers = [];
        const invoke = (type, payload = {}, timeoutMs = 15000) => new Promise((resolve, reject) => {
          const requestId = `wpf_${Date.now()}_${++sequence}`;
          const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new Error("CanvasFlow desktop request timed out"));
          }, timeoutMs);
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
          storeImage: (dataUrl, fileName, mime, category = "originals") => invoke("desktop:store-image", { dataUrl, fileName, mime, category }, 60000),
          readAsset: assetId => invoke("desktop:read-asset", { assetId }, 60000),
          openFileLocation: filePath => invoke("desktop:open-file-location", { filePath: String(filePath || "") }),
          chooseOutputFolder: currentPath => invoke("desktop:choose-output-folder", { currentPath: String(currentPath || "") }),
          openOutputFolder: folderPath => invoke("desktop:open-output-folder", { folderPath: String(folderPath || "") }),
          copyImage: filePath => invoke("desktop:copy-image", { filePath: String(filePath || "") }),
          openScreenshotWindow: () => invoke("desktop:open-screenshot-window"),
          backgroundRemovalStatus: () => invoke("desktop:background-removal-status", {}, 60000),
          installBackgroundRemoval: () => invoke("desktop:install-background-removal", {}, 2400000),
          uninstallBackgroundRemoval: () => invoke("desktop:uninstall-background-removal", {}, 60000),
          removeImageBackground: payload => invoke("desktop:remove-image-background", payload || {}, 1200000),
          apiRequest: (path, options = {}) => invoke("desktop:api", {
            path: String(path || ""),
            method: String(options.method || "GET"),
            body: typeof options.body === "string" ? options.body : ""
          }, 120000),
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
        Closed += (_, _) => System.Windows.Application.Current.Shutdown();
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

    private void CanvasView_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key != System.Windows.Input.Key.V
            || (System.Windows.Input.Keyboard.Modifiers & System.Windows.Input.ModifierKeys.Control) == 0) return;
        if (!TryPostNativeClipboardContent()) return;
        e.Handled = true;
    }

    private bool TryPostNativeClipboardContent()
    {
        try
        {
            object? message = null;
            if (System.Windows.Clipboard.ContainsImage())
            {
                var pngBytes = ReadClipboardPngBytes();
                if (pngBytes is not null)
                {
                    message = new { type = "desktop:paste", kind = "image", dataUrl = $"data:image/png;base64,{Convert.ToBase64String(pngBytes)}", mime = "image/png" };
                }
            }
            else if (System.Windows.Clipboard.ContainsText())
            {
                var text = System.Windows.Clipboard.GetText();
                if (!string.IsNullOrEmpty(text)) message = new { type = "desktop:paste", kind = "text", text };
            }
            if (message is null || CanvasView.CoreWebView2 is null) return false;
            CanvasView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message));
            Log("[剪贴板] 已将 Windows 剪贴板内容交给画板。", false);
            return true;
        }
        catch (Exception error)
        {
            Log($"[剪贴板] 读取失败。可能原因：剪贴板正被其他程序占用。建议：重新复制后再粘贴。详细信息：{error.Message}", true);
            return false;
        }
    }

    private static byte[]? ReadClipboardPngBytes()
    {
        // Applications such as browsers usually expose a real PNG stream. Keep it unchanged when available.
        var dataObject = System.Windows.Clipboard.GetDataObject();
        if (dataObject?.GetDataPresent("PNG", false) == true)
        {
            var pngData = dataObject.GetData("PNG", false);
            if (pngData is MemoryStream memory)
            {
                memory.Position = 0;
                return memory.ToArray();
            }
            if (pngData is byte[] bytes && bytes.Length > 0) return bytes;
        }

        var bitmap = System.Windows.Clipboard.GetImage();
        if (bitmap is null) return null;
        // Snipaste commonly supplies DIB/DIBV5. WPF can interpret its alpha channel as fully transparent;
        // converting to BGR32 preserves the visible RGB pixels and deliberately removes that invalid alpha.
        var opaque = bitmap.Format == System.Windows.Media.PixelFormats.Bgr32
            ? bitmap
            : new System.Windows.Media.Imaging.FormatConvertedBitmap(bitmap, System.Windows.Media.PixelFormats.Bgr32, null, 0);
        var encoder = new System.Windows.Media.Imaging.PngBitmapEncoder();
        encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(opaque));
        using var stream = new MemoryStream();
        encoder.Save(stream);
        return stream.ToArray();
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        var startupTimer = Stopwatch.StartNew();
        try
        {
            (_root, _contentRoot) = FindApplicationPaths();
            foreach (var name in new[] { "data", "download", "export" }) Directory.CreateDirectory(Path.Combine(_root, name));
            _desktopApi = new DesktopApi(_root, Log, ReadApiKey);
            _backgroundRemovalPlugin = new BackgroundRemovalPlugin(_root, Log);
            var assetsTask = Task.Run(LoadAssets, _shutdown.Token);
            Log("[启动] 已找到项目目录。", false);
            await InitializeWebViewAsync(_shutdown.Token);
            Log($"[启动性能] WebView2 环境初始化完成：{startupTimer.ElapsedMilliseconds}ms", false);
            await assetsTask;
            Log($"[启动性能] 素材索引读取完成：{startupTimer.ElapsedMilliseconds}ms", false);
            NavigateCanvas();
        }
        catch (OperationCanceledException) when (_shutdown.IsCancellationRequested) { }
        catch (Exception ex) { ShowFailure(ex); }
    }

    private static (string DataRoot, string ContentRoot) FindApplicationPaths()
    {
        var candidates = new[]
        {
            AppContext.BaseDirectory,
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..")),
            Environment.CurrentDirectory
        };
        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!File.Exists(Path.Combine(candidate, "index.html")) || !File.Exists(Path.Combine(candidate, "app.js")) || !File.Exists(Path.Combine(candidate, "styles.css"))) continue;
            var contentRoot = Path.GetFullPath(candidate);
            var dataRoot = string.Equals(Path.GetFileName(contentRoot.TrimEnd(Path.DirectorySeparatorChar)), "app", StringComparison.OrdinalIgnoreCase)
                ? Directory.GetParent(contentRoot)?.FullName ?? contentRoot
                : contentRoot;
            return (dataRoot, contentRoot);
        }
        throw new DirectoryNotFoundException("没有找到CanvasFlow界面文件。可能原因：程序文件不完整。建议办法：重新解压或安装完整版本。");
    }

    private async Task InitializeWebViewAsync(CancellationToken cancellationToken)
    {
        StatusText.Text = "正在加载画布…";
        try
        {
            _webViewEnvironment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(_root!, "data", "webview2"));
            await CanvasView.EnsureCoreWebView2Async(_webViewEnvironment);
            CanvasView.PreviewKeyDown += CanvasView_PreviewKeyDown;
            CanvasView.CoreWebView2.SetVirtualHostNameToFolderMapping("canvasflow.local", _contentRoot!, CoreWebView2HostResourceAccessKind.DenyCors);
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
                        _darkTheme = dark;
                        Dispatcher.Invoke(() =>
                        {
                            ApplyTitleBarColors(dark);
                            _screenshotToolWindow?.ApplyTheme(dark);
                        });
                        Log($"[主题] 标题栏已切换为{(dark ? "深色" : "浅色")}模式。", false);
                    }
                    else if (type.GetString() == "pick-image-folder")
                    {
                        await PickImageFolderAsync();
                    }
                    else if (type.GetString() == "desktop:store-image")
                    {
                        try { PostRpcResult(root, await StoreImageAsync(root)); }
                        catch (Exception storeError) { PostRpcResult(root, error: storeError.Message); }
                    }
                    else if (type.GetString() == "desktop:read-asset")
                    {
                        try { PostRpcResult(root, await ReadAssetAsync(root)); }
                        catch (Exception readError) { PostRpcResult(root, error: readError.Message); }
                    }
                    else if (type.GetString() == "desktop:open-file-location")
                    {
                        try { PostRpcResult(root, OpenFileLocation(root)); }
                        catch (Exception openError) { PostRpcResult(root, error: openError.Message); }
                    }
                    else if (type.GetString() == "desktop:choose-output-folder")
                    {
                        try { PostRpcResult(root, ChooseOutputFolder(root)); }
                        catch (Exception chooseError) { PostRpcResult(root, error: chooseError.Message); }
                    }
                    else if (type.GetString() == "desktop:open-output-folder")
                    {
                        try { PostRpcResult(root, OpenOutputFolder(root)); }
                        catch (Exception openError) { PostRpcResult(root, error: openError.Message); }
                    }
                    else if (type.GetString() == "desktop:copy-image")
                    {
                        try { PostRpcResult(root, CopyImageToClipboard(root)); }
                        catch (Exception copyError) { PostRpcResult(root, error: copyError.Message); }
                    }
                    else if (type.GetString() == "desktop:open-screenshot-window")
                    {
                        try
                        {
                            Dispatcher.Invoke(OpenScreenshotTool);
                            PostRpcResult(root, new { opened = true });
                        }
                        catch (Exception openError) { PostRpcResult(root, error: openError.Message); }
                    }
                    else if (type.GetString() == "desktop:background-removal-status")
                    {
                        try { PostRpcResult(root, await RequireBackgroundRemovalPlugin().StatusAsync()); }
                        catch (Exception statusError) { PostRpcResult(root, error: statusError.Message); }
                    }
                    else if (type.GetString() == "desktop:install-background-removal")
                    {
                        try
                        {
                            var result = await RequireBackgroundRemovalPlugin().InstallAsync((percent, stage) => Dispatcher.Invoke(() =>
                                CanvasView.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "plugin-install-progress", pluginId = "background-removal", percent, stage }))), _shutdown.Token);
                            PostRpcResult(root, result);
                        }
                        catch (Exception installError) { PostRpcResult(root, error: installError.Message); }
                    }
                    else if (type.GetString() == "desktop:uninstall-background-removal")
                    {
                        try { PostRpcResult(root, RequireBackgroundRemovalPlugin().Uninstall()); }
                        catch (Exception uninstallError) { PostRpcResult(root, error: uninstallError.Message); }
                    }
                    else if (type.GetString() == "desktop:remove-image-background")
                    {
                        try
                        {
                            var dataUrl = root.TryGetProperty("dataUrl", out var dataValue) ? dataValue.GetString() ?? "" : "";
                            var fileName = root.TryGetProperty("fileName", out var nameValue) ? nameValue.GetString() ?? "image.png" : "image.png";
                            var outputRoot = root.TryGetProperty("outputRoot", out var outputValue) ? outputValue.GetString() ?? "" : "";
                            if (string.IsNullOrWhiteSpace(outputRoot)) outputRoot = Path.Combine(_root!, "export");
                            PostRpcResult(root, await RequireBackgroundRemovalPlugin().RemoveBackgroundAsync(dataUrl, fileName, outputRoot, _shutdown.Token));
                        }
                        catch (Exception removalError) { Log($"[智能抠图插件] 任务失败：{removalError}", true); PostRpcResult(root, error: removalError.Message); }
                    }
                    else if (type.GetString() == "screenshot:task-update")
                    {
                        var update = new ScreenshotTaskUpdate(
                            root.TryGetProperty("requestId", out var requestValue) ? requestValue.GetString() ?? "" : "",
                            root.TryGetProperty("taskId", out var taskValue) ? taskValue.GetString() ?? "" : "",
                            root.TryGetProperty("status", out var statusValue) ? statusValue.GetString() ?? "" : "",
                            root.TryGetProperty("progress", out var progressValue) && progressValue.TryGetInt32(out var progress) ? progress : 0,
                            root.TryGetProperty("outputPath", out var outputValue) ? outputValue.GetString() ?? "" : "",
                            root.TryGetProperty("error", out var errorValue) ? errorValue.GetString() ?? "" : "");
                        _screenshotToolWindow?.HandleTaskUpdate(update);
                    }
                    else if (type.GetString() == "screenshot:node-catalog")
                    {
                        var options = new List<ScreenshotCanvasNodeOption>();
                        if (root.TryGetProperty("nodes", out var nodesValue) && nodesValue.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in nodesValue.EnumerateArray()) options.Add(new ScreenshotCanvasNodeOption(
                                item.TryGetProperty("id", out var idValue) ? idValue.GetString() ?? "" : "",
                                item.TryGetProperty("name", out var nameValue) ? nameValue.GetString() ?? "截图功能节点" : "截图功能节点",
                                item.TryGetProperty("summary", out var summaryValue) ? summaryValue.GetString() ?? "" : ""));
                        }
                        _screenshotToolWindow?.UpdateCanvasNodes(options);
                    }
                    else if (type.GetString() == "screenshot:batch-dialog-open")
                    {
                        Dispatcher.Invoke(() =>
                        {
                            _screenshotToolWindow?.SuspendForCanvasDialog();
                            if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
                            Activate();
                        });
                    }
                    else if (type.GetString() == "screenshot:batch-dialog-close")
                    {
                        Dispatcher.Invoke(() => _screenshotToolWindow?.RestoreAfterCanvasDialog());
                    }
                    else if (type.GetString() == "desktop:api")
                    {
                        try
                        {
                            if (_desktopApi is null) throw new InvalidOperationException("桌面接口尚未初始化");
                            var method = root.TryGetProperty("method", out var methodElement) ? methodElement.GetString() ?? "GET" : "GET";
                            var path = root.TryGetProperty("path", out var pathElement) ? pathElement.GetString() ?? "" : "";
                            var body = root.TryGetProperty("body", out var bodyElement) ? bodyElement.GetString() ?? "" : "";
                            var response = await _desktopApi.HandleAsync(method, path, body, _shutdown.Token);
                            PostRpcResult(root, new { status = response.Status, body = response.Body, contentType = response.ContentType });
                        }
                        catch (Exception apiError) { PostRpcResult(root, error: apiError.Message); }
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
        return Uri.TryCreate(value, UriKind.Absolute, out var candidate)
            && candidate.Scheme == Uri.UriSchemeHttps
            && candidate.Host.Equals("canvasflow.local", StringComparison.OrdinalIgnoreCase);
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

    private BackgroundRemovalPlugin RequireBackgroundRemovalPlugin() =>
        _backgroundRemovalPlugin ?? throw new InvalidOperationException("智能抠图插件服务尚未初始化");

    private string SecretsPath => Path.Combine(_root!, "data", "secrets.json");
    private string AssetsDirectory => Path.Combine(_root!, "data", "assets");
    private string AssetsIndexPath => Path.Combine(AssetsDirectory, "index.json");

    private void LoadAssets()
    {
        try
        {
            Directory.CreateDirectory(AssetsDirectory);
            if (!File.Exists(AssetsIndexPath)) return;
            var saved = JsonSerializer.Deserialize<Dictionary<string, AssetRecord>>(File.ReadAllText(AssetsIndexPath, Encoding.UTF8));
            if (saved is null) return;
            foreach (var item in saved)
            {
                var fullPath = SafeAssetPath(item.Value.RelativePath);
                if (Regex.IsMatch(item.Key, "^[a-f0-9]{64}$", RegexOptions.IgnoreCase) && File.Exists(fullPath)) _assets[item.Key] = item.Value;
            }
        }
        catch (Exception error)
        {
            Log($"[素材仓库] 读取索引失败。可能原因：索引文件损坏。建议办法：从备份恢复data目录。详细信息：{error.Message}", true);
        }
    }

    private void SaveAssets()
    {
        Directory.CreateDirectory(AssetsDirectory);
        Dictionary<string, AssetRecord> snapshot;
        lock (_assetLock) snapshot = new Dictionary<string, AssetRecord>(_assets, StringComparer.OrdinalIgnoreCase);
        var content = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true });
        var temporary = AssetsIndexPath + $".{Environment.ProcessId}.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.tmp";
        File.WriteAllText(temporary, content, Encoding.UTF8);
        File.Move(temporary, AssetsIndexPath, true);
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

    private static string MimeFromExtension(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        _ => throw new InvalidDataException("文件不是支持的图片格式")
    };

    private static string ExtensionFromMime(string mime) => mime.ToLowerInvariant() switch
    {
        "image/jpeg" => ".jpg",
        "image/png" => ".png",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        _ => throw new InvalidDataException("图片格式不受支持")
    };

    private Task<AssetRecord> StoreImageAsync(JsonElement request)
    {
        var dataUrl = request.GetProperty("dataUrl").GetString() ?? "";
        var fileName = request.TryGetProperty("fileName", out var nameElement) ? Path.GetFileName(nameElement.GetString() ?? "image") : "image";
        var category = request.TryGetProperty("category", out var categoryElement) && categoryElement.GetString() == "generated" ? "generated" : "originals";
        return Task.Run(() => StoreImageData(dataUrl, fileName, category), _shutdown.Token);
    }

    private AssetRecord StoreImageData(string dataUrl, string fileName, string category)
    {
        var match = Regex.Match(dataUrl, "^data:(image/(?:jpeg|png|webp|gif));base64,(.+)$", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        if (!match.Success) throw new InvalidDataException("图片数据格式无效");
        var mime = match.Groups[1].Value.ToLowerInvariant();
        var bytes = Convert.FromBase64String(match.Groups[2].Value);
        if (bytes.Length > 64 * 1024 * 1024) throw new InvalidDataException("单张图片超过64MB限制");
        return StoreAssetBytes(bytes, fileName, mime, true, category);
    }

    private AssetRecord StoreAssetFile(string sourcePath, bool saveIndex)
    {
        var bytes = File.ReadAllBytes(sourcePath);
        if (bytes.Length > 64 * 1024 * 1024) throw new InvalidDataException($"图片超过64MB限制：{Path.GetFileName(sourcePath)}");
        return StoreAssetBytes(bytes, Path.GetFileName(sourcePath), MimeFromExtension(Path.GetExtension(sourcePath)), saveIndex);
    }

    private AssetRecord StoreAssetBytes(byte[] bytes, string fileName, string mime, bool saveIndex, string category = "originals")
    {
        var id = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        AssetRecord record;
        lock (_assetLock)
        {
            if (_assets.TryGetValue(id, out var existing)) return existing;
            var relativePath = Path.Combine(category == "generated" ? "generated" : "originals", id + ExtensionFromMime(mime));
            var destination = Path.Combine(AssetsDirectory, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.WriteAllBytes(destination, bytes);
            record = new AssetRecord { Id = id, FileName = Path.GetFileName(fileName), Mime = mime, RelativePath = relativePath, Size = bytes.LongLength };
            _assets[id] = record;
        }
        if (saveIndex) SaveAssets();
        return record;
    }

    private async Task<object> ReadAssetAsync(JsonElement request)
    {
        var assetId = request.GetProperty("assetId").GetString() ?? "";
        AssetRecord asset;
        lock (_assetLock)
        {
            if (!_assets.TryGetValue(assetId, out asset!)) throw new FileNotFoundException("素材不存在，可能已被移动或删除");
        }
        var filePath = SafeAssetPath(asset.RelativePath);
        var bytes = await File.ReadAllBytesAsync(filePath, _shutdown.Token);
        return new { dataUrl = $"data:{asset.Mime};base64,{Convert.ToBase64String(bytes)}", asset.FileName, asset.Mime };
    }

    private object OpenFileLocation(JsonElement request)
    {
        var requestedPath = request.TryGetProperty("filePath", out var pathElement) ? pathElement.GetString() ?? "" : "";
        if (string.IsNullOrWhiteSpace(requestedPath)) throw new ArgumentException("图片没有可用的本地文件路径");
        var fullPath = Path.GetFullPath(requestedPath);
        if (!File.Exists(fullPath)) throw new FileNotFoundException("生成图片文件不存在，可能已被移动或删除", fullPath);
        var directory = Path.GetDirectoryName(fullPath);
        if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory)) throw new DirectoryNotFoundException("生成图片所在文件夹不存在");
        Process.Start(new ProcessStartInfo { FileName = directory, UseShellExecute = true });
        Log($"[生成结果] 已请求打开所在文件夹：{directory}", false);
        return new { opened = true, path = fullPath, directory };
    }

    private object ChooseOutputFolder(JsonElement request)
    {
        var currentPath = request.TryGetProperty("currentPath", out var pathElement) ? pathElement.GetString() ?? "" : "";
        var picker = new Microsoft.Win32.OpenFolderDialog
        {
            Title = "选择生成文件保存位置",
            Multiselect = false
        };
        if (!string.IsNullOrWhiteSpace(currentPath))
        {
            try
            {
                var fullCurrentPath = Path.GetFullPath(currentPath);
                if (Directory.Exists(fullCurrentPath)) picker.InitialDirectory = fullCurrentPath;
            }
            catch (Exception error) { Log($"[生成文件夹] 忽略无效的初始路径：{error.Message}", true); }
        }
        if (picker.ShowDialog(this) != true) return new { cancelled = true, path = currentPath };
        var selectedPath = Path.GetFullPath(picker.FolderName);
        Log($"[生成文件夹] 用户已选择：{selectedPath}", false);
        return new { cancelled = false, path = selectedPath };
    }

    private object OpenOutputFolder(JsonElement request)
    {
        var requestedPath = request.TryGetProperty("folderPath", out var pathElement) ? pathElement.GetString() ?? "" : "";
        if (string.IsNullOrWhiteSpace(requestedPath)) throw new ArgumentException("生成文件夹路径为空");
        var fullPath = Path.GetFullPath(requestedPath);
        Directory.CreateDirectory(fullPath);
        Process.Start(new ProcessStartInfo { FileName = fullPath, UseShellExecute = true });
        Log($"[生成文件夹] 已请求打开：{fullPath}", false);
        return new { opened = true, path = fullPath };
    }

    private object CopyImageToClipboard(JsonElement request)
    {
        var requestedPath = request.TryGetProperty("filePath", out var pathElement) ? pathElement.GetString() ?? "" : "";
        if (string.IsNullOrWhiteSpace(requestedPath)) throw new ArgumentException("图片没有可用的本地文件路径");
        var fullPath = Path.GetFullPath(requestedPath);
        if (!File.Exists(fullPath)) throw new FileNotFoundException("图片文件不存在，可能已被移动或删除", fullPath);
        var bitmap = LoadClipboardBitmap(fullPath);
        System.Windows.Clipboard.SetImage(bitmap);
        Log($"[生成结果] 已复制图片到剪贴板：{fullPath}", false);
        return new { copied = true, path = fullPath };
    }

    private static System.Windows.Media.Imaging.BitmapSource LoadClipboardBitmap(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var decoder = System.Windows.Media.Imaging.BitmapDecoder.Create(
            stream,
            System.Windows.Media.Imaging.BitmapCreateOptions.PreservePixelFormat,
            System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
        var bitmap = decoder.Frames[0];
        bitmap.Freeze();
        return bitmap;
    }

    private string SafeAssetPath(string relativePath)
    {
        var root = Path.GetFullPath(AssetsDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var candidate = Path.GetFullPath(Path.Combine(AssetsDirectory, relativePath));
        if (!candidate.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("素材索引包含无效路径");
        return candidate;
    }

    private async Task PickImageFolderAsync()
    {
        try
        {
            var picker = new Microsoft.Win32.OpenFolderDialog
            {
                Title = "选择图片文件夹",
                Multiselect = false
            };
            if (picker.ShowDialog(this) != true) return;
            if (_webViewEnvironment is null) throw new InvalidOperationException("WebView2 环境尚未准备完成");
            var directoryHandle = _webViewEnvironment.CreateWebFileSystemDirectoryHandle(
                picker.FolderName,
                CoreWebView2FileSystemHandlePermission.ReadOnly);
            var folderName = Path.GetFileName(picker.FolderName.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            var selectedFolder = picker.FolderName;
            var importedAssets = await Task.Run(() =>
            {
                var assets = new List<object>();
                foreach (var sourcePath in Directory.EnumerateFiles(selectedFolder, "*", SearchOption.AllDirectories))
                {
                    _shutdown.Token.ThrowIfCancellationRequested();
                    try
                    {
                        var mime = MimeFromExtension(Path.GetExtension(sourcePath));
                        var asset = StoreAssetFile(sourcePath, false);
                        assets.Add(new
                        {
                            relativePath = Path.GetRelativePath(selectedFolder, sourcePath).Replace('\\', '/'),
                            assetId = asset.Id,
                            asset.FileName,
                            mime
                        });
                    }
                    catch (InvalidDataException) { }
                }
                SaveAssets();
                return assets;
            }, _shutdown.Token);
            var payload = JsonSerializer.Serialize(new { type = "image-folder-selected", folderName, assets = importedAssets });
            CanvasView.CoreWebView2.PostWebMessageAsJson(payload, new List<object> { directoryHandle });
        }
        catch (Exception error)
        {
            Log($"[文件夹上传] 无法打开或读取文件夹。可能原因：目录权限不足或选择器异常。建议办法：换一个普通图片目录后重试。详细信息：{error.Message}", true);
            var payload = System.Text.Json.JsonSerializer.Serialize(new { type = "image-folder-error", error = error.Message });
            CanvasView.CoreWebView2.PostWebMessageAsJson(payload);
        }
    }


    private void NavigateCanvas()
    {
        var navigationTimer = Stopwatch.StartNew();
        CanvasView.CoreWebView2.DOMContentLoaded += (_, _) =>
        {
            if (StartupOverlay.Visibility != Visibility.Visible) return;
            StartupOverlay.Visibility = Visibility.Collapsed;
            Log($"[启动性能] 页面结构已就绪并提前显示画布：{navigationTimer.ElapsedMilliseconds}ms", false);
        };
        CanvasView.CoreWebView2.NavigationCompleted += (_, e) =>
        {
            if (e.IsSuccess)
            {
                _canvasReady = true;
                StartupOverlay.Visibility = Visibility.Collapsed;
                Log($"[启动性能] 页面导航完成：{navigationTimer.ElapsedMilliseconds}ms", false);
                Log($"[画布] 加载完成：{CanvasUrl}", false);
            }
            else
            {
                StatusText.Text = "画布加载失败";
                Log($"[错误] 画布加载失败：{e.WebErrorStatus}", true);
            }
        };
        CanvasView.Source = new Uri(CanvasUrl);
    }

    private void OpenScreenshotTool()
    {
        if (_root is null) throw new InvalidOperationException("CanvasFlow 数据目录尚未准备完成，请稍后重试。");
        if (_screenshotToolWindow is null)
        {
            _screenshotToolWindow = new ScreenshotToolWindow(_root);
            _screenshotToolWindow.GenerationRequested += EnqueueScreenshotGenerationAsync;
            _screenshotToolWindow.PromptLibraryChanged += NotifyPromptLibraryChangedAsync;
            _screenshotToolWindow.ApplyTheme(_darkTheme);
        }
        _screenshotToolWindow.ShowAndActivate();
        if (_canvasReady && CanvasView.CoreWebView2 is not null)
            CanvasView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "screenshot:request-node-catalog" }));
    }

    private Task NotifyPromptLibraryChangedAsync()
    {
        if (!_canvasReady || CanvasView.CoreWebView2 is null) return Task.CompletedTask;
        CanvasView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
        {
            type = "screenshot:prompt-library-changed"
        }));
        return Task.CompletedTask;
    }

    private Task EnqueueScreenshotGenerationAsync(ScreenshotGenerationRequest request)
    {
        if (!_canvasReady || CanvasView.CoreWebView2 is null)
            throw new InvalidOperationException("主画板尚未加载完成，请稍后重试。");
        CanvasView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
        {
            type = "screenshot:enqueue",
            requestId = request.RequestId,
            imageDataUrl = request.ImageDataUrl,
            prompt = request.Prompt,
            model = request.Model,
            resolution = request.Resolution,
            quality = request.Quality,
            ratio = request.Ratio,
            count = request.Count,
            thumbnailDataUrl = request.ThumbnailDataUrl
            ,useCanvasNodeInput = request.UseCanvasNodeInput
            ,canvasNodeId = request.CanvasNodeId
        }));
        return Task.CompletedTask;
    }

    private void ShowFailure(Exception ex)
    {
        StatusText.Text = "启动失败";
        Log($"[错误] {ex.Message}", true);
        System.Windows.MessageBox.Show(ex.Message, "CanvasFlow 启动失败", MessageBoxButton.OK, MessageBoxImage.Error);
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
            System.Windows.MessageBox.Show(
                $"项目没有成功保存，因此CanvasFlow没有退出。\n\n可能原因：数据目录无写入权限或页面暂时无响应。\n建议办法：确认磁盘和目录权限后再次关闭。\n\n详细信息：{saveResult.Error}",
                "CanvasFlow 保存失败",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        Hide();
        _screenshotToolWindow?.ShutdownWindow();
        _shutdown.Cancel();
        _shutdownComplete = true;
        Environment.Exit(0);
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

}
