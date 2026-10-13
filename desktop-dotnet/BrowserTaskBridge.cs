using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace CanvasFlow.Desktop;

// Only the browser task protocol is exposed; secrets and other desktop APIs stay private.
internal sealed class BrowserTaskBridge : IDisposable
{
    private readonly DesktopApi _api;
    private readonly Action<string, bool> _log;
    private readonly CancellationTokenSource _stop = new();
    private TcpListener? _listener;
    public int Port { get; private set; }
    public BrowserTaskBridge(DesktopApi api, Action<string, bool> log) { _api = api; _log = log; }
    public void Start()
    {
        for (var port = 5173; port < 5193; port++)
        {
            var listener = new TcpListener(IPAddress.Loopback, port);
            try { listener.Start(); _listener = listener; Port = port; break; }
            catch (SocketException) { listener.Stop(); }
        }
        if (_listener is null) throw new IOException("浏览器桥端口 5173–5192 均被占用");
        _ = AcceptAsync();
        _log($"[浏览器桥] 已启动：http://127.0.0.1:{Port}/", false);
    }
    private async Task AcceptAsync()
    {
        while (!_stop.IsCancellationRequested)
        {
            try { var client = await _listener!.AcceptTcpClientAsync(_stop.Token); _ = HandleAsync(client); }
            catch (Exception) when (_stop.IsCancellationRequested) { return; }
            catch (Exception error) { _log($"[浏览器桥] 接收失败：{error.Message}", true); return; }
        }
    }
    private async Task HandleAsync(TcpClient client)
    {
        using (client)
        using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token))
        {
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
            var token = timeout.Token;
            var stream = client.GetStream();
            try
            {
                var header = new List<byte>();
                var single = new byte[1];
                while (header.Count < 16384)
                {
                    if (await stream.ReadAsync(single, token) == 0) return;
                    header.Add(single[0]);
                    var n = header.Count;
                    if (n >= 4 && header[n-4] == 13 && header[n-3] == 10 && header[n-2] == 13 && header[n-1] == 10) break;
                }
                if (header.Count >= 16384) { await ReplyAsync(stream, 431, "{}", token); return; }
                var lines = Encoding.ASCII.GetString(header.ToArray()).Split("\r\n");
                var parts = lines[0].Split(' ');
                if (parts.Length != 3 || !parts[1].StartsWith('/')) { await ReplyAsync(stream, 400, "{}", token); return; }
                var headers = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
                foreach (var line in lines.Skip(1)) { var colon = line.IndexOf(':'); if (colon > 0) headers[line[..colon]] = line[(colon+1)..].Trim(); }
                // Block webpage cross-origin access; the extension's background has host permission.
                if (headers.TryGetValue("Origin", out var origin) && !origin.StartsWith("chrome-extension://", StringComparison.OrdinalIgnoreCase))
                { await ReplyAsync(stream, 403, "{}", token); return; }
                if (!headers.TryGetValue("Host", out var host) || (host != $"127.0.0.1:{Port}" && host != $"localhost:{Port}"))
                { await ReplyAsync(stream, 403, "{}", token); return; }
                var uri = new Uri("http://127.0.0.1" + parts[1]);
                var allowed = parts[0] == "GET" && (uri.AbsolutePath == "/api/browser-task/pending" || uri.AbsolutePath == "/api/browser-task/next" || uri.AbsolutePath.StartsWith("/api/browser-task/status/", StringComparison.Ordinal))
                    || parts[0] == "POST" && uri.AbsolutePath == "/api/browser-task/result";
                if (!allowed) { await ReplyAsync(stream, 404, "{}", token); return; }
                if (headers.ContainsKey("Transfer-Encoding")) { await ReplyAsync(stream, 400, "{}", token); return; }
                var length = 0;
                if (headers.TryGetValue("Content-Length", out var lengthText) && (!int.TryParse(lengthText, out length) || length < 0 || length > 128 * 1024 * 1024))
                { await ReplyAsync(stream, 413, "{}", token); return; }
                var body = new byte[length];
                await stream.ReadExactlyAsync(body, token);
                var result = await _api.HandleAsync(parts[0], parts[1], Encoding.UTF8.GetString(body), "", token);
                await ReplyAsync(stream, result.Status, result.Body, token);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                _log($"[浏览器桥] 请求失败：{error.Message}", true);
                try { await ReplyAsync(stream, 400, JsonSerializer.Serialize(new { error = "浏览器桥请求失败" }), token); } catch { }
            }
            catch (OperationCanceledException) { }
        }
    }
    private static async Task ReplyAsync(Stream stream, int status, string body, CancellationToken token)
    {
        var bytes = Encoding.UTF8.GetBytes(body);
        var header = Encoding.ASCII.GetBytes($"HTTP/1.1 {status} Response\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {bytes.Length}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
        await stream.WriteAsync(header, token); await stream.WriteAsync(bytes, token);
    }
    public void Dispose() { _stop.Cancel(); _listener?.Stop(); }
}
