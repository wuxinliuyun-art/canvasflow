using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CanvasFlow.Desktop;

internal sealed record DesktopApiResponse(int Status, string Body, string ContentType = "application/json;charset=utf-8");

internal sealed class DesktopApi
{
    private const int MaxBodyCharacters = 180 * 1024 * 1024;
    private static readonly string[] ApiBaseUrls = [
        "https://api.apib.ai", "https://api.aiuxu.com", "https://api.aishuch.com", "https://api.apimart.ai"
    ];
    private readonly string _root;
    private readonly Action<string, bool> _log;
    private readonly Func<string> _getApiKey;
    private readonly HttpClient _http;
    private readonly string _version;
    private readonly WebUpdateManager _webUpdateManager;
    private JsonObject? _releaseCache;
    private DateTimeOffset _releaseCacheAt;

    public DesktopApi(string root, Action<string, bool> log, Func<string> getApiKey, WebUpdateManager webUpdateManager)
    {
        _root = Path.GetFullPath(root);
        _log = log;
        _getApiKey = getApiKey;
        _webUpdateManager = webUpdateManager;
        _http = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.All
        }) { Timeout = TimeSpan.FromSeconds(120) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("CanvasFlow/2.6.4");
        _version = ReadVersion();
    }

    public async Task<object> ApplyLatestWebUpdateAsync(CancellationToken cancellationToken)
    {
        if (_releaseCache is null || DateTimeOffset.UtcNow - _releaseCacheAt >= TimeSpan.FromMinutes(10))
            await CheckForUpdatesAsync(cancellationToken);
        var webAsset = _releaseCache?["webAsset"] as JsonObject ?? throw new InvalidOperationException("当前 Release 没有可用的界面热更新包，请下载完整安装包");
        var version = _releaseCache?["latestVersion"]?.GetValue<string>() ?? "";
        var url = webAsset["url"]?.GetValue<string>() ?? "";
        var digest = webAsset["digest"]?.GetValue<string>() ?? "";
        var result = await _webUpdateManager.DownloadAndApplyAsync(url, digest, version, cancellationToken);
        if (_releaseCache is not null)
        {
            _releaseCache["currentVersion"] = _webUpdateManager.ActiveVersion;
            _releaseCache["hasUpdate"] = false;
        }
        return result;
    }

    public Task<DesktopApiResponse> HandleAsync(string method, string pathAndQuery, string body, CancellationToken cancellationToken)
    {
        if (body.Length > MaxBodyCharacters) return Task.FromResult(Json(413, new { error = "请求内容超过128MB限制" }));
        var uri = new Uri("https://canvasflow.local" + (pathAndQuery.StartsWith('/') ? pathAndQuery : "/" + pathAndQuery));
        if (IsNetworkRoute(uri.AbsolutePath)) return HandleNetworkAsync(method.ToUpperInvariant(), uri, body, cancellationToken);
        return Task.Run(() => HandleLocal(method.ToUpperInvariant(), pathAndQuery, body), cancellationToken);
    }

    private static bool IsNetworkRoute(string path) => path is "/api/generate" or "/api/models" or "/api/balance" or "/api/download-image" or "/api/update/check"
        || path.StartsWith("/api/task/", StringComparison.Ordinal);

    private async Task<DesktopApiResponse> HandleNetworkAsync(string method, Uri requestUri, string body, CancellationToken cancellationToken)
    {
        try
        {
            var path = requestUri.AbsolutePath;
            if (method == "GET" && path == "/api/update/check") return await CheckForUpdatesAsync(cancellationToken);
            if (method == "POST" && path == "/api/download-image") return await DownloadImageAsync(body, cancellationToken);
            if (method == "POST" && path == "/api/generate")
            {
                var payload = JsonNode.Parse(body)?.AsObject() ?? throw new InvalidDataException("生成参数为空");
                payload.Remove("_apiKey");
                return await ProxyApiAsync(HttpMethod.Post, "/v1/images/generations", payload.ToJsonString(), cancellationToken);
            }
            if (method == "GET" && path.StartsWith("/api/task/", StringComparison.Ordinal))
            {
                var taskId = Uri.UnescapeDataString(path["/api/task/".Length..]);
                if (!Regex.IsMatch(taskId, @"^[A-Za-z0-9._:-]{1,200}$")) throw new InvalidDataException("任务编号格式不正确");
                return await ProxyApiAsync(HttpMethod.Get, "/v1/tasks/" + Uri.EscapeDataString(taskId), null, cancellationToken);
            }
            if (method == "GET" && path == "/api/models") return await ProxyApiAsync(HttpMethod.Get, "/v1/models", null, cancellationToken);
            if (method == "GET" && path == "/api/balance") return await ProxyApiAsync(HttpMethod.Get, "/v1/balance", null, cancellationToken);
            return Json(405, new { error = "请求方法不受支持" });
        }
        catch (Exception error)
        {
            _log($"[联网接口] 请求失败：{method} {requestUri.AbsolutePath}。详细信息：{error.Message}", true);
            return Json(502, new { error = new { code = 502, message = "联网请求失败: " + error.Message } });
        }
    }

    private async Task<DesktopApiResponse> ProxyApiAsync(HttpMethod method, string apiPath, string? body, CancellationToken cancellationToken)
    {
        Exception? lastError = null;
        DesktopApiResponse? lastRetryableResponse = null;
        foreach (var baseUrl in ApiBaseUrls)
        {
            try
            {
                using var request = new HttpRequestMessage(method, baseUrl + apiPath);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _getApiKey());
                if (body is not null) request.Content = new StringContent(body, Encoding.UTF8, "application/json");
                using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                var result = new DesktopApiResponse((int)response.StatusCode, responseBody, response.Content.Headers.ContentType?.ToString() ?? "application/json");
                if (result.Status is 500 or 502 or 503 or 504)
                {
                    lastRetryableResponse = result;
                    _log($"[AI代理] {baseUrl}{apiPath} -> {result.Status}，尝试备用地址", true);
                    continue;
                }
                _log($"[AI代理] {baseUrl}{apiPath} -> {result.Status}", false);
                return result;
            }
            catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
            {
                lastError = error;
                _log($"[AI代理] {baseUrl}{apiPath} 连接失败，尝试备用地址：{error.Message}", true);
            }
        }
        if (lastRetryableResponse is not null) return lastRetryableResponse;
        throw lastError ?? new HttpRequestException("所有API地址均不可达");
    }

    private async Task<DesktopApiResponse> DownloadImageAsync(string body, CancellationToken cancellationToken)
    {
        using var document = JsonDocument.Parse(body);
        var value = document.RootElement.GetProperty("imageUrl").GetString() ?? "";
        var current = new Uri(value, UriKind.Absolute);
        for (var redirect = 0; redirect <= 5; redirect++)
        {
            await ValidatePublicHttpsUriAsync(current, cancellationToken);
            using var request = new HttpRequestMessage(HttpMethod.Get, current);
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is not null)
            {
                current = response.Headers.Location.IsAbsoluteUri ? response.Headers.Location : new Uri(current, response.Headers.Location);
                continue;
            }
            response.EnsureSuccessStatusCode();
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "image/png";
            if (!contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("远程地址返回的不是图片");
            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            if (bytes.Length > 64 * 1024 * 1024) throw new InvalidDataException("远程图片超过64MB限制");
            return Json(200, new { base64 = $"data:{contentType};base64,{Convert.ToBase64String(bytes)}" });
        }
        throw new HttpRequestException("图片下载重定向次数过多");
    }

    private static async Task ValidatePublicHttpsUriAsync(Uri uri, CancellationToken cancellationToken)
    {
        if (uri.Scheme != Uri.UriSchemeHttps || uri.IsDefaultPort is false && uri.Port != 443) throw new InvalidDataException("只允许下载HTTPS图片");
        var addresses = await Dns.GetHostAddressesAsync(uri.DnsSafeHost, cancellationToken);
        if (addresses.Length == 0 || addresses.Any(IsPrivateAddress)) throw new InvalidDataException("图片地址指向本机或内网，已拒绝访问");
    }

    private static bool IsPrivateAddress(IPAddress address)
    {
        if (IPAddress.IsLoopback(address)) return true;
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var bytes = address.GetAddressBytes();
            return bytes[0] == 10 || bytes[0] == 127 || bytes[0] == 0 ||
                   bytes[0] == 169 && bytes[1] == 254 ||
                   bytes[0] == 172 && bytes[1] is >= 16 and <= 31 ||
                   bytes[0] == 192 && bytes[1] == 168;
        }
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
            return address.IsIPv6LinkLocal || address.IsIPv6SiteLocal || address.Equals(IPAddress.IPv6Loopback) || (address.GetAddressBytes()[0] & 0xFE) == 0xFC;
        return true;
    }

    private async Task<DesktopApiResponse> CheckForUpdatesAsync(CancellationToken cancellationToken)
    {
        if (_releaseCache is not null && DateTimeOffset.UtcNow - _releaseCacheAt < TimeSpan.FromMinutes(10)) return Json(200, _releaseCache);
        try
        {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.github.com/repos/wuxinliuyun-art/canvasflow/releases/latest");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        request.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new HttpRequestException($"GitHub返回HTTP {(int)response.StatusCode}");
        var release = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellationToken))?.AsObject() ?? throw new InvalidDataException("GitHub Release响应为空");
        var setupAssets = (release["assets"] as JsonArray)?.OfType<JsonObject>().Where(asset => string.Equals(asset["name"]?.GetValue<string>(), "CanvasFlow-Setup.exe", StringComparison.OrdinalIgnoreCase)).ToList() ?? [];
        if (setupAssets.Count != 1) throw new InvalidDataException($"最新Release应包含且只包含一个CanvasFlow-Setup.exe，当前检测到{setupAssets.Count}个");
        var asset = setupAssets[0];
        var webAssets = (release["assets"] as JsonArray)?.OfType<JsonObject>().Where(item => string.Equals(item["name"]?.GetValue<string>(), "CanvasFlow-Web.zip", StringComparison.OrdinalIgnoreCase)).ToList() ?? [];
        if (webAssets.Count > 1) throw new InvalidDataException($"最新Release最多包含一个CanvasFlow-Web.zip，当前检测到{webAssets.Count}个");
        var webAsset = webAssets.FirstOrDefault();
        var latestVersion = (release["tag_name"]?.GetValue<string>() ?? release["name"]?.GetValue<string>() ?? "").TrimStart('v', 'V');
        var displayedVersion = string.IsNullOrWhiteSpace(_webUpdateManager.ActiveVersion) ? _version : _webUpdateManager.ActiveVersion;
        _releaseCache = new JsonObject
        {
            ["currentVersion"] = displayedVersion,
            ["latestVersion"] = latestVersion,
            ["releaseName"] = release["name"]?.GetValue<string>() ?? release["tag_name"]?.GetValue<string>() ?? latestVersion,
            ["notes"] = release["body"]?.GetValue<string>() ?? "",
            ["pageUrl"] = release["html_url"]?.GetValue<string>() ?? "https://github.com/wuxinliuyun-art/canvasflow/releases/latest",
            ["hasUpdate"] = IsNewerVersion(latestVersion, displayedVersion),
            ["canAutoInstall"] = !string.IsNullOrWhiteSpace(asset["digest"]?.GetValue<string>()),
            ["canHotUpdate"] = webAsset is not null && !string.IsNullOrWhiteSpace(webAsset["digest"]?.GetValue<string>()),
            ["asset"] = new JsonObject
            {
                ["name"] = asset["name"]?.GetValue<string>() ?? "CanvasFlow-Setup.exe",
                ["size"] = asset["size"]?.GetValue<long>() ?? 0,
                ["url"] = asset["browser_download_url"]?.GetValue<string>() ?? "",
                ["digest"] = asset["digest"]?.GetValue<string>() ?? ""
            },
            ["webAsset"] = webAsset is null ? null : new JsonObject
            {
                ["name"] = webAsset["name"]?.GetValue<string>() ?? "CanvasFlow-Web.zip",
                ["size"] = webAsset["size"]?.GetValue<long>() ?? 0,
                ["url"] = webAsset["browser_download_url"]?.GetValue<string>() ?? "",
                ["digest"] = webAsset["digest"]?.GetValue<string>() ?? ""
            }
        };
        _releaseCacheAt = DateTimeOffset.UtcNow;
        return Json(200, _releaseCache);
        }
        catch (Exception apiError)
        {
            _log($"[更新检查] GitHub API不可用，改用公开Release地址：{apiError.Message}", true);
            using var request = new HttpRequestMessage(HttpMethod.Get, "https://github.com/wuxinliuyun-art/canvasflow/releases/latest");
            using var response = await _http.SendAsync(request, cancellationToken);
            var location = response.Headers.Location;
            if (location is null) throw;
            var absolute = location.IsAbsoluteUri ? location : new Uri(request.RequestUri!, location);
            var match = Regex.Match(absolute.AbsolutePath, @"/releases/tag/([^/?#]+)", RegexOptions.IgnoreCase);
            if (!match.Success) throw;
            var tag = Uri.UnescapeDataString(match.Groups[1].Value);
            var latestVersion = tag.TrimStart('v', 'V');
            _releaseCache = new JsonObject
            {
                ["currentVersion"] = _version,
                ["latestVersion"] = latestVersion,
                ["releaseName"] = tag,
                ["notes"] = "",
                ["pageUrl"] = absolute.ToString(),
                ["hasUpdate"] = IsNewerVersion(latestVersion, _version),
                ["canAutoInstall"] = false,
                ["canHotUpdate"] = false,
                ["webAsset"] = null,
                ["asset"] = new JsonObject
                {
                    ["name"] = "CanvasFlow-Setup.exe",
                    ["size"] = 0,
                    ["url"] = $"https://github.com/wuxinliuyun-art/canvasflow/releases/download/{Uri.EscapeDataString(tag)}/CanvasFlow-Setup.exe",
                    ["digest"] = ""
                }
            };
            _releaseCacheAt = DateTimeOffset.UtcNow;
            return Json(200, _releaseCache);
        }
    }

    private string ReadVersion()
    {
        try
        {
            var candidates = new[] { Path.Combine(_root, "package.json"), Path.Combine(_root, "app", "package.json") };
            var path = candidates.FirstOrDefault(File.Exists) ?? throw new FileNotFoundException("package.json not found");
            using var document = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
            return document.RootElement.GetProperty("version").GetString() ?? "0.0.0";
        }
        catch { return typeof(DesktopApi).Assembly.GetName().Version?.ToString(3) ?? "0.0.0"; }
    }

    private static bool IsNewerVersion(string candidate, string current)
    {
        static int[] Parts(string value) => value.TrimStart('v', 'V').Split('.', '-', StringSplitOptions.RemoveEmptyEntries).Take(3).Select(part => int.TryParse(part, out var number) ? number : 0).Concat([0, 0, 0]).Take(3).ToArray();
        var next = Parts(candidate);
        var now = Parts(current);
        for (var index = 0; index < 3; index++) if (next[index] != now[index]) return next[index] > now[index];
        return false;
    }

    private DesktopApiResponse HandleLocal(string method, string pathAndQuery, string body)
    {
        try
        {
            var uri = new Uri("https://canvasflow.local" + (pathAndQuery.StartsWith('/') ? pathAndQuery : "/" + pathAndQuery));
            var path = uri.AbsolutePath;
            if (method == "GET" && path == "/api/runtime-paths")
                return Json(200, new { dataRoot = _root, exportFolder = Path.Combine(_root, "export"), projectsFolder = Path.Combine(_root, "projects") });
            if (path == "/api/app-state") return HandleAppState(method, body);
            if (path == "/api/custom-library") return HandleCustomLibrary(method, body);
            if (method == "POST" && path == "/api/auto-backup") return SaveAutoBackup(body);
            if (method == "POST" && path == "/api/save-json") return SaveJson(body);
            if (method == "POST" && path == "/api/save-project") return SaveProject(body);
            if (method == "POST" && path == "/api/save-images") return SaveImages(body);
            if (path == "/api/custom-material") return HandleCustomMaterial(method, body);
            if (method == "POST" && path == "/api/save-export-files") return SaveExportFiles(body);
            return Json(404, new { error = "桌面接口不存在" });
        }
        catch (JsonException error) { return Json(400, new { error = $"JSON格式不正确：{error.Message}" }); }
        catch (Exception error)
        {
            _log($"[桌面接口] 请求失败：{method} {pathAndQuery}。详细信息：{error.Message}", true);
            return Json(500, new { error = error.Message });
        }
    }

    private DesktopApiResponse HandleAppState(string method, string body)
    {
        var filePath = Path.Combine(_root, "data", "app-state.json");
        if (method == "GET")
        {
            var state = File.Exists(filePath) ? JsonNode.Parse(File.ReadAllText(filePath, Encoding.UTF8)) : null;
            return Json(200, new JsonObject { ["state"] = state });
        }
        if (method != "POST") return MethodNotAllowed();
        var stateNode = JsonNode.Parse(body)?.AsObject() ?? throw new InvalidDataException("项目状态为空");
        if (stateNode["pages"] is not JsonArray pages) throw new InvalidDataException("项目状态格式无效");
        foreach (var page in pages.OfType<JsonObject>())
            if (page["data"]?["settings"] is JsonObject settings) settings["apiKey"] = "";
        AtomicWrite(filePath, stateNode.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        return Json(200, new { success = true });
    }

    private DesktopApiResponse HandleCustomLibrary(string method, string body)
    {
        var filePath = Path.Combine(_root, "data", "custom-library.json");
        if (method == "GET")
        {
            var content = File.Exists(filePath) ? File.ReadAllText(filePath, Encoding.UTF8) : "{\"textTemplates\":[],\"imageMaterials\":[],\"builtinDefaultsInitialized\":false}";
            JsonNode.Parse(content);
            return new DesktopApiResponse(200, content);
        }
        if (method != "POST") return MethodNotAllowed();
        var library = JsonNode.Parse(body)?.AsObject() ?? throw new InvalidDataException("素材库内容为空");
        if (library["textTemplates"] is not JsonArray texts || library["imageMaterials"] is not JsonArray images)
            throw new InvalidDataException("素材库格式不正确");
        AtomicWrite(filePath, library.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        _log($"[素材库] 已保存：文字={texts.Count}，图片={images.Count}", false);
        return Json(200, new { success = true });
    }

    private DesktopApiResponse SaveAutoBackup(string body)
    {
        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        var name = SafeJsonFileName(root.GetProperty("name").GetString(), 100);
        var content = root.GetProperty("content").GetString() ?? "";
        if (string.IsNullOrWhiteSpace(content)) throw new InvalidDataException("自动备份内容为空");
        JsonDocument.Parse(content).Dispose();
        var filePath = Path.Combine(_root, "download", "自动备份", name);
        AtomicWrite(filePath, content);
        _log($"[自动备份] 已写入：{filePath}，字节={Encoding.UTF8.GetByteCount(content)}", false);
        return Json(200, new { success = true, path = filePath });
    }

    private DesktopApiResponse SaveJson(string body)
    {
        using var document = JsonDocument.Parse(body);
        var name = SafeJsonFileName(document.RootElement.GetProperty("name").GetString(), 160);
        var content = document.RootElement.GetProperty("content").GetString() ?? "";
        JsonDocument.Parse(content).Dispose();
        var filePath = Path.Combine(_root, "download", name);
        AtomicWrite(filePath, content);
        return Json(200, new { success = true, path = filePath });
    }

    private DesktopApiResponse SaveProject(string body)
    {
        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        var name = SafeLeafName(root.GetProperty("name").GetString());
        if (!name.EndsWith(".cflow", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("项目文件必须使用 .cflow 后缀");
        var content = root.GetProperty("content").GetString() ?? "";
        using var contentDocument = JsonDocument.Parse(content);
        var type = contentDocument.RootElement.TryGetProperty("type", out var typeElement) ? typeElement.GetString() : "";
        if (type is not ("project" or "library")) throw new InvalidDataException("CanvasFlow 文件类型不正确");
        var requestedFolder = root.TryGetProperty("folderPath", out var folderElement) ? folderElement.GetString() ?? "" : "";
        var folder = string.IsNullOrWhiteSpace(requestedFolder) ? Path.Combine(_root, "projects") : Path.GetFullPath(requestedFolder);
        Directory.CreateDirectory(folder);
        var filePath = Path.Combine(folder, name);
        AtomicWrite(filePath, content);
        _log($"[项目保存] 类型={type}，路径={filePath}，字节={Encoding.UTF8.GetByteCount(content)}", false);
        return Json(200, new { success = true, path = filePath, type });
    }

    private DesktopApiResponse SaveImages(string body)
    {
        using var document = JsonDocument.Parse(body);
        var results = new List<object>();
        foreach (var file in document.RootElement.GetProperty("files").EnumerateArray())
        {
            var name = SafeLeafName(file.GetProperty("name").GetString());
            WriteBase64File(Path.Combine(_root, "download", "images", name), file.GetProperty("data").GetString() ?? "");
            results.Add(new { name, saved = true });
        }
        return Json(200, new { success = true, files = results });
    }

    private DesktopApiResponse HandleCustomMaterial(string method, string body)
    {
        using var document = JsonDocument.Parse(body);
        if (method == "POST")
        {
            var originalName = SafeLeafName(document.RootElement.GetProperty("name").GetString());
            var safeName = Regex.Replace(originalName, @"[^a-zA-Z0-9_\-\u4e00-\u9fa5\.]", "_");
            var fileName = $"custom_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{safeName}";
            WriteBase64File(Path.Combine(_root, "download", "images", fileName), document.RootElement.GetProperty("data").GetString() ?? "");
            return Json(200, new { success = true, fileName });
        }
        if (method == "DELETE")
        {
            var fileName = SafeLeafName(document.RootElement.GetProperty("fileName").GetString());
            var filePath = Path.Combine(_root, "download", "images", fileName);
            if (File.Exists(filePath)) File.Delete(filePath);
            return Json(200, new { success = true });
        }
        return MethodNotAllowed();
    }

    private DesktopApiResponse SaveExportFiles(string body)
    {
        using var document = JsonDocument.Parse(body);
        var request = document.RootElement;
        var baseFolder = request.TryGetProperty("baseFolder", out var baseElement) ? baseElement.GetString() ?? "" : "";
        var configuredRoot = string.IsNullOrWhiteSpace(baseFolder) || baseFolder == "export"
            ? Path.Combine(_root, "export")
            : (Path.IsPathFullyQualified(baseFolder) ? Path.GetFullPath(baseFolder) : Path.GetFullPath(Path.Combine(_root, baseFolder)));
        var folderName = SafeLeafName(request.GetProperty("folderName").GetString());
        var exportDirectory = Path.Combine(configuredRoot, folderName);
        Directory.CreateDirectory(exportDirectory);
        var exportPrefix = Path.GetFullPath(exportDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var savedFiles = new List<string>();
        foreach (var file in request.GetProperty("files").EnumerateArray())
        {
            var relative = SafeRelativePath(file.GetProperty("name").GetString());
            var target = Path.GetFullPath(Path.Combine(exportDirectory, relative));
            if (!target.StartsWith(exportPrefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("导出文件超出目标目录");
            WriteBase64File(target, file.GetProperty("data").GetString() ?? "");
            savedFiles.Add(target);
        }
        return Json(200, new { success = true, path = exportDirectory, files = savedFiles });
    }

    private static void WriteBase64File(string filePath, string value)
    {
        var separator = value.IndexOf(',');
        var base64 = separator >= 0 ? value[(separator + 1)..] : value;
        var bytes = Convert.FromBase64String(base64);
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        File.WriteAllBytes(filePath, bytes);
    }

    private static string SafeJsonFileName(string? value, int maxLength)
    {
        var name = SafeLeafName(value);
        if (name.Length > maxLength || !name.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("JSON文件名格式不正确");
        return name;
    }

    private static string SafeLeafName(string? value)
    {
        var name = value ?? "";
        if (string.IsNullOrWhiteSpace(name) || name != Path.GetFileName(name) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            throw new InvalidDataException("文件名格式不正确");
        return name;
    }

    private static string SafeRelativePath(string? value)
    {
        var parts = (value ?? "").Replace('\\', '/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0 || parts.Any(part => part is "." or ".." || part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0))
            throw new InvalidDataException("导出文件路径不安全");
        return Path.Combine(parts);
    }

    private static void AtomicWrite(string filePath, string content)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        var temporary = filePath + $".{Environment.ProcessId}.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.tmp";
        File.WriteAllText(temporary, content, Encoding.UTF8);
        File.Move(temporary, filePath, true);
    }

    private static DesktopApiResponse Json(int status, object value) =>
        new(status, JsonSerializer.Serialize(value));

    private static DesktopApiResponse MethodNotAllowed() => Json(405, new { error = "请求方法不受支持" });
}
