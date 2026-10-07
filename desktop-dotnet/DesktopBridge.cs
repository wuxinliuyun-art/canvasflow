using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CanvasFlow.Desktop;

// Localhost-only HTTP bridge so the Photoshop CEP panel can reuse the canvas's
// API surface while the desktop app is running. Random port + random token;
// %APPDATA%\CanvasFlowBridge\bridge.json tells the panel where to connect.
// Requests dispatch straight into DesktopApi - no shell, no extra processes.
// Uses the "localhost" prefix because http.sys reserves it for non-admin users.
internal sealed class DesktopBridge : IDisposable
{
    private readonly DesktopApi _api;
    private readonly Action<string, bool> _log;
    private readonly Action<string?, string>? _onImageReturned;
    private readonly HttpListener _listener = new();
    private readonly string _token;
    private CancellationTokenSource? _cancellation;
    private System.Threading.Timer? _discoveryHeartbeat;

    public int Port { get; }

    public DesktopBridge(DesktopApi api, Action<string, bool> log, Action<string?, string>? onImageReturned = null)
    {
        _api = api;
        _log = log;
        _onImageReturned = onImageReturned;
        _token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        Port = FindFreePort();
        _listener.Prefixes.Add($"http://localhost:{Port}/");
    }

    public void Start()
    {
        _cancellation = new CancellationTokenSource();
        _listener.Start();
        WriteDiscoveryFile();
        // 心跳重写发现文件：被误删（如清理脚本）后 30 秒内自愈，PS 面板始终能找回桥端口
        _discoveryHeartbeat = new System.Threading.Timer(_ => { try { WriteDiscoveryFile(); } catch { } }, null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
        _ = Task.Run(AcceptLoopAsync);
        _log($"[桥接] CEP 面板桥已启动：http://localhost:{Port}/", false);
    }

    public void Dispose()
    {
        try { _cancellation?.Cancel(); } catch { }
        try { _discoveryHeartbeat?.Dispose(); } catch { }
        try { _listener.Close(); } catch { }
        try { File.Delete(BridgeFilePath); } catch { }
    }

    private static string BridgeFolder =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "CanvasFlowBridge");

    private static string BridgeFilePath => Path.Combine(BridgeFolder, "bridge.json");

    private static int FindFreePort()
    {
        var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        try { return ((IPEndPoint)probe.LocalEndpoint).Port; }
        finally { probe.Stop(); }
    }

    private void WriteDiscoveryFile()
    {
        Directory.CreateDirectory(BridgeFolder);
        var payload = JsonSerializer.Serialize(new
        {
            port = Port,
            token = _token,
            pid = Environment.ProcessId,
            source = "desktop",
        });
        // 不带 BOM：PS 面板的 Node JSON.parse 不接受 BOM
        File.WriteAllText(BridgeFilePath, payload, new UTF8Encoding(false));
    }

    private async Task AcceptLoopAsync()
    {
        while (_cancellation is { IsCancellationRequested: false })
        {
            HttpListenerContext context;
            try { context = await _listener.GetContextAsync(); }
            catch (Exception) { return; } // listener closed
            _ = Task.Run(() => HandleAsync(context));
        }
    }

    private async Task HandleAsync(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;
        try
        {
            var tokenHeader = request.Headers["X-CanvasFlow-Bridge"] ?? request.QueryString["bridgeToken"] ?? "";
            if (!string.Equals(tokenHeader, _token, StringComparison.Ordinal))
            {
                await WriteJsonAsync(response, 401, "{\"error\":\"bridge token mismatch\"}");
                return;
            }
            // PS 面板回传：不走 DesktopApi，直接回调宿主注入画布页面（desktop:paste 消息）
            if (request.HttpMethod == "POST" && request.Url!.AbsolutePath == "/api/ps/return-image" && _onImageReturned is not null)
            {
                string returnBody;
                using (var reader = new StreamReader(request.InputStream, Encoding.UTF8))
                {
                    returnBody = await reader.ReadToEndAsync();
                }
                using (var document = JsonDocument.Parse(returnBody))
                {
                    var name = document.RootElement.TryGetProperty("name", out var nameElement) ? nameElement.GetString() : null;
                    var data = document.RootElement.TryGetProperty("data", out var dataElement) ? dataElement.GetString() ?? "" : "";
                    if (!data.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("回传内容不是图片");
                    _onImageReturned(name, data);
                }
                await WriteJsonAsync(response, 200, "{\"ok\":true}");
                return;
            }
            string body;
            using (var reader = new StreamReader(request.InputStream, Encoding.UTF8))
            {
                body = await reader.ReadToEndAsync();
            }
            var apiKey = request.Headers["X-CanvasFlow-Api-Key"] ?? "";
            var result = await _api.HandleAsync(request.HttpMethod, request.Url!.PathAndQuery, body, apiKey, CancellationToken.None);
            // CEP 面板用 GET /api/models 探测桥是否在运行（CF_PANEL_PROBE）
            if (request.HttpMethod == "GET" && request.Url.AbsolutePath == "/api/models")
                response.Headers["Access-Control-Allow-Origin"] = "*";
            await WriteJsonAsync(response, result.Status, result.Body, result.ContentType);
        }
        catch (Exception error)
        {
            _log($"[桥接] 请求处理失败：{request.HttpMethod} {request.Url?.PathAndQuery}。详细信息：{error.Message}", true);
            try { await WriteJsonAsync(response, 500, JsonSerializer.Serialize(new { error = error.Message })); }
            catch { }
        }
        finally
        {
            try { response.Close(); } catch { }
        }
    }

    private static async Task WriteJsonAsync(HttpListenerResponse response, int status, string body, string? contentType = null)
    {
        response.StatusCode = status;
        response.ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/json;charset=utf-8" : contentType;
        var bytes = Encoding.UTF8.GetBytes(body);
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes);
    }
}
