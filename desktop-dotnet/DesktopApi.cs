using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace CanvasFlow.Desktop;

internal sealed record DesktopApiResponse(int Status, string Body, string ContentType = "application/json;charset=utf-8");

internal sealed class DesktopApi
{
    private const int MaxBodyCharacters = 180 * 1024 * 1024;
    private const string AgtokenBaseUrl = "https://agtoken.vip";
    private static readonly string[] ApiBaseUrls = [
        "https://api.apib.ai", "https://api.aiuxu.com", "https://api.aishuch.com", "https://api.apimart.ai"
    ];
    private static readonly HashSet<string> TrustedImageHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "getapib.org"
    };
    private readonly string _root;
    private readonly Action<string, bool> _log;
    private readonly Func<string> _getApiKey;
    private readonly Func<string> _getAgtokenKey;
    private readonly Func<string> _getContentRoot;
    private readonly HttpClient _http;
    private readonly HttpClient _agtokenHttp;
    private readonly string _version;
    private readonly WebUpdateManager _webUpdateManager;
    private JsonObject? _releaseCache;
    private DateTimeOffset _releaseCacheAt;

    public DesktopApi(string root, Action<string, bool> log, Func<string> getApiKey, WebUpdateManager webUpdateManager, Func<string>? getAgtokenKey = null, Func<string>? getContentRoot = null)
    {
        _root = Path.GetFullPath(root);
        _log = log;
        _getApiKey = getApiKey;
        _getAgtokenKey = getAgtokenKey ?? (() => "");
        // 界面热更新会把 cep-panel 面板源文件带进内容根，安装面板时必须优先取内容根里的版本
        _getContentRoot = getContentRoot ?? (() => "");
        _webUpdateManager = webUpdateManager;
        _http = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.All
        }) { Timeout = TimeSpan.FromSeconds(120) };
        // agtoken 为同步接口，官方建议超时上限 600 秒
        _agtokenHttp = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.All
        }) { Timeout = TimeSpan.FromSeconds(600) };
        _version = ReadVersion();
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"CanvasFlow/{_version}");
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

    public Task<DesktopApiResponse> HandleAsync(string method, string pathAndQuery, string body, string apiKey, CancellationToken cancellationToken)
    {
        if (body.Length > MaxBodyCharacters) return Task.FromResult(Json(413, new { error = "请求内容超过128MB限制" }));
        var uri = new Uri("https://canvasflow.local" + (pathAndQuery.StartsWith('/') ? pathAndQuery : "/" + pathAndQuery));
        if (IsNetworkRoute(uri.AbsolutePath)) return HandleNetworkAsync(method.ToUpperInvariant(), uri, body, apiKey, cancellationToken);
        return Task.Run(() => HandleLocal(method.ToUpperInvariant(), pathAndQuery, body), cancellationToken);
    }

    private static bool IsNetworkRoute(string path) => path is "/api/generate" or "/api/models" or "/api/balance" or "/api/download-image" or "/api/update/check"
        or "/api/agtoken/generate" or "/api/agtoken/edits" or "/api/agtoken/models"
        || path.StartsWith("/api/task/", StringComparison.Ordinal);

    private async Task<DesktopApiResponse> HandleNetworkAsync(string method, Uri requestUri, string body, string apiKey, CancellationToken cancellationToken)
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
            if (method == "GET" && path == "/api/models") return await ProxyApiAsync(HttpMethod.Get, "/v1/models", null, cancellationToken, apiKey);
            if (method == "GET" && path == "/api/balance") return await ProxyApiAsync(HttpMethod.Get, "/v1/balance", null, cancellationToken, apiKey);
            if (method == "POST" && path is "/api/agtoken/generate" or "/api/agtoken/edits")
            {
                var payload = JsonNode.Parse(body)?.AsObject() ?? throw new InvalidDataException("生成参数为空");
                var payloadKey = payload.TryGetPropertyValue("_apiKey", out var keyNode) ? keyNode?.GetValue<string>() ?? "" : "";
                payload.Remove("_apiKey");
                var upstreamPath = path == "/api/agtoken/generate" ? "/v1/images/generations" : "/v1/images/edits";
                var upstreamKey = string.IsNullOrWhiteSpace(payloadKey) ? apiKey : payloadKey;
                // CEP 面板桥请求可能不带 key：回落到桌面端已保存的 agtoken key
                if (string.IsNullOrWhiteSpace(upstreamKey)) upstreamKey = _getAgtokenKey();
                return await ProxyAgtokenAsync(HttpMethod.Post, upstreamPath, payload.ToJsonString(), upstreamKey, cancellationToken);
            }
            if (method == "GET" && path == "/api/agtoken/models")
            {
                var fallbackKey = string.IsNullOrWhiteSpace(apiKey) ? _getAgtokenKey() : apiKey;
                return await ProxyAgtokenAsync(HttpMethod.Get, "/v1/models", null, fallbackKey, cancellationToken);
            }
            return Json(405, new { error = "请求方法不受支持" });
        }
        catch (Exception error)
        {
            _log($"[联网接口] 请求失败：{method} {requestUri.AbsolutePath}。详细信息：{DescribeException(error)}", true);
            return Json(502, new { error = new { code = 502, message = "联网请求失败: " + DescribeException(error) } });
        }
    }

    // SSL/代理类失败的真实原因通常在内层异常（如握手被重置、超时），只记外层 Message 会得到无用的 "see inner exception"
    private static string DescribeException(Exception error)
    {
        var messages = new List<string>();
        for (var current = (Exception?)error; current is not null; current = current.InnerException)
        {
            var message = current.Message?.Trim() ?? "";
            if (message.Length > 0 && (messages.Count == 0 || !string.Equals(messages[^1], message, StringComparison.Ordinal)))
                messages.Add(message);
        }
        return messages.Count > 0 ? string.Join(" ← ", messages) : error.GetType().Name;
    }

    private async Task<DesktopApiResponse> ProxyApiAsync(HttpMethod method, string apiPath, string? body, CancellationToken cancellationToken, string apiKey = "")
    {
        Exception? lastError = null;
        DesktopApiResponse? lastRetryableResponse = null;
        foreach (var baseUrl in ApiBaseUrls)
        {
            try
            {
                using var request = new HttpRequestMessage(method, baseUrl + apiPath);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", string.IsNullOrWhiteSpace(apiKey) ? _getApiKey() : apiKey.Trim());
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

    // agtoken 与 APIMart 请求格式彼此独立：单上游、不回退 APIMart Key、600 秒超时
    private async Task<DesktopApiResponse> ProxyAgtokenAsync(HttpMethod method, string apiPath, string? body, string apiKey, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(method, AgtokenBaseUrl + apiPath);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey.Trim());
            if (body is not null) request.Content = new StringContent(body, Encoding.UTF8, "application/json");
            using var response = await _agtokenHttp.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            _log($"[AGToken代理] {apiPath} -> {(int)response.StatusCode}", false);
            return new DesktopApiResponse((int)response.StatusCode, responseBody, response.Content.Headers.ContentType?.ToString() ?? "application/json");
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            throw new HttpRequestException($"agtoken 接口请求失败：{error.Message}");
        }
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
        if (TrustedImageHosts.Contains(uri.DnsSafeHost)) return;
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
            if (method == "GET" && path == "/api/extensions") return ListExtensions();
            if (method == "POST" && path == "/api/extensions/refresh") return ListExtensions();
            if (method == "POST" && path.StartsWith("/api/extensions/", StringComparison.Ordinal) && path.EndsWith("/run", StringComparison.Ordinal)) return RunExtension(path, body);
            if (method == "GET" && path == "/api/cep/status") return CepPanelStatus();
            if (method == "POST" && path == "/api/cep/install") return InstallCepPanel();
            if (method == "POST" && path == "/api/cep/uninstall") return UninstallCepPanel();
            if (method == "GET" && path == "/api/ps/pending") return Json(200, new { data = Array.Empty<object>() }); // CEP 面板探测口（桌面版回传走桥接回调，队列恒为空）
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
            if (page["data"]?["settings"] is JsonObject settings)
            {
                settings["apiKey"] = "";
                settings["agtokenApiKey"] = "";
            }
        AtomicWrite(filePath, stateNode.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        return Json(200, new { success = true });
    }

    private DesktopApiResponse HandleCustomLibrary(string method, string body)
    {
        var filePath = Path.Combine(_root, "data", "custom-library.json");
        if (method == "GET")
        {
            var content = File.Exists(filePath) ? File.ReadAllText(filePath, Encoding.UTF8) : "{\"textTemplates\":[],\"imageMaterials\":[],\"multiNodeTemplates\":[],\"variableDefinitions\":[],\"builtinDefaultsInitialized\":false}";
            JsonNode.Parse(content);
            return new DesktopApiResponse(200, content);
        }
        if (method != "POST") return MethodNotAllowed();
        var library = JsonNode.Parse(body)?.AsObject() ?? throw new InvalidDataException("素材库内容为空");
        if (library["textTemplates"] is not JsonArray texts || library["imageMaterials"] is not JsonArray images)
            throw new InvalidDataException("素材库格式不正确");
        var variables = library["variableDefinitions"] as JsonArray ?? [];
        library["variableDefinitions"] = variables;
        var multiNodes = library["multiNodeTemplates"] as JsonArray ?? [];
        library["multiNodeTemplates"] = multiNodes;
        AtomicWrite(filePath, library.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        _log($"[素材库] 已保存：文字={texts.Count}，图片={images.Count}，多节点={multiNodes.Count}，变量={variables.Count}", false);
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

    // ---- 拓展（内置扩展服务）----
    // 拓展文件夹固定在程序目录旁边（安装版 {安装目录}\拓展，源码版 仓库上级\拓展）。
    // 桌面端直接承担原 扩展服务.bat 的扫描与执行职责，页面经 apiFetch 调用，无需手动启动服务；
    // 调用约定遵循《拓展脚本规范》：清空 input/ 写入图片 → 以拓展目录为工作目录运行入口脚本 → 收集 output/。

    private string ExtensionsFolder => Path.GetFullPath(Path.Combine(_root, "..", "拓展"));

    private DesktopApiResponse ListExtensions()
    {
        var extensions = new JsonArray();
        var invalid = new JsonArray();
        var folder = ExtensionsFolder;
        if (Directory.Exists(folder))
        {
            foreach (var dir in Directory.EnumerateDirectories(folder).OrderBy(value => value, StringComparer.OrdinalIgnoreCase))
            {
                try { extensions.Add(ReadExtensionManifest(dir)); }
                catch (Exception error)
                {
                    invalid.Add(new JsonObject { ["id"] = Path.GetFileName(dir), ["name"] = Path.GetFileName(dir), ["error"] = error.Message });
                }
            }
        }
        return Json(200, new { ok = true, extensions, invalid, baseDir = Directory.Exists(folder) ? folder : "" });
    }

    private JsonObject ReadExtensionManifest(string directory)
    {
        var manifestPath = Path.Combine(directory, "扩展.json");
        if (!File.Exists(manifestPath)) throw new InvalidDataException("缺少 扩展.json");
        var manifest = JsonNode.Parse(File.ReadAllText(manifestPath, Encoding.UTF8))?.AsObject() ?? throw new InvalidDataException("扩展.json 为空");
        var id = manifest["id"]?.ToString() ?? throw new InvalidDataException("缺少 id");
        if (string.IsNullOrWhiteSpace(id)) throw new InvalidDataException("id 为空");
        var entry = SafeLeafName(manifest["entry"]?.ToString() ?? throw new InvalidDataException("缺少 entry"));
        if (!File.Exists(Path.Combine(directory, entry))) throw new InvalidDataException($"缺少入口文件 {entry}");
        return new JsonObject
        {
            ["id"] = id,
            ["name"] = manifest["name"]?.ToString() ?? id,
            ["description"] = manifest["description"]?.ToString() ?? "",
            ["entry"] = entry,
            ["input"] = manifest["input"]?.ToString() ?? "images",
            ["output"] = manifest["output"]?.ToString() ?? "images",
            ["params"] = (manifest["params"] as JsonArray ?? new JsonArray()).DeepClone(),
            ["columns"] = manifest["columns"] is JsonNode columnsNode && columnsNode.GetValue<int>() == 2 ? 2 : 1,
            ["timeout"] = manifest["timeout"] is JsonNode timeoutNode && timeoutNode.GetValue<int>() > 0 ? timeoutNode.GetValue<int>() : 600,
        };
    }

    private string? FindExtensionDirectory(string id)
    {
        var folder = ExtensionsFolder;
        if (!Directory.Exists(folder)) return null;
        foreach (var dir in Directory.EnumerateDirectories(folder))
        {
            try
            {
                if (string.Equals(ReadExtensionManifest(dir)["id"]?.ToString(), id, StringComparison.OrdinalIgnoreCase)) return dir;
            }
            catch { }
        }
        return null;
    }

    private DesktopApiResponse RunExtension(string path, string body)
    {
        // 路由形如 /api/extensions/{id}/run
        var id = Uri.UnescapeDataString(path.Split('/')[3]);
        var directory = FindExtensionDirectory(id) ?? throw new InvalidDataException($"找不到拓展 {id}，请刷新拓展列表");
        var manifest = ReadExtensionManifest(directory);
        var entry = manifest["entry"]!.ToString();
        var outputMode = manifest["output"]!.ToString();
        var timeoutSeconds = manifest["timeout"]!.GetValue<int>();
        var request = JsonNode.Parse(body)?.AsObject() ?? throw new InvalidDataException("请求内容为空");
        var inputImages = request["images"] as JsonArray ?? throw new InvalidDataException("请求缺少 images");

        var inputDirectory = Path.Combine(directory, "input");
        Directory.CreateDirectory(inputDirectory);
        foreach (var stale in Directory.EnumerateFiles(inputDirectory)) File.Delete(stale);
        foreach (var image in inputImages.OfType<JsonObject>())
        {
            var name = SafeLeafName(image["name"]?.ToString());
            var data = image["data"]?.ToString() ?? throw new InvalidDataException($"图片 {name} 缺少数据");
            File.WriteAllBytes(Path.Combine(inputDirectory, name), Convert.FromBase64String(data));
        }
        AtomicWrite(Path.Combine(directory, "params.json"), (request["params"] as JsonObject ?? new JsonObject()).ToJsonString());

        var outputDirectory = Path.Combine(directory, "output");
        if (Directory.Exists(outputDirectory)) Directory.Delete(outputDirectory, true);
        var stopwatch = Stopwatch.StartNew();
        var (pythonFile, pythonPrefix) = ResolvePython();
        var startInfo = new ProcessStartInfo
        {
            FileName = pythonFile,
            Arguments = $"{pythonPrefix}\"{entry}\"",
            WorkingDirectory = directory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        _log($"[拓展] 运行 {id}（{inputImages.Count} 张输入）", false);
        using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("无法启动 Python 进程");
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(timeoutSeconds * 1000))
        {
            try { process.Kill(entireProcessTree: true); } catch { }
            throw new TimeoutException($"拓展执行超过 {timeoutSeconds} 秒，已终止");
        }
        if (process.ExitCode != 0)
        {
            var detail = TailText(stderrTask.GetAwaiter().GetResult(), 500);
            throw new InvalidOperationException($"拓展脚本失败（退出码 {process.ExitCode}）：{detail}");
        }
        var images = new JsonArray();
        var files = new JsonArray();
        if (Directory.Exists(outputDirectory))
        {
            foreach (var file in Directory.EnumerateFiles(outputDirectory, "*", SearchOption.AllDirectories).OrderBy(value => value, StringComparer.OrdinalIgnoreCase))
            {
                var payload = new JsonObject
                {
                    ["name"] = Path.GetRelativePath(outputDirectory, file).Replace('\\', '/'),
                    ["data"] = Convert.ToBase64String(File.ReadAllBytes(file)),
                };
                if (string.Equals(outputMode, "images", StringComparison.OrdinalIgnoreCase)) images.Add(payload); else files.Add(payload);
            }
        }
        _log($"[拓展] {id} 完成：{images.Count + files.Count} 个输出，用时 {stopwatch.Elapsed.TotalSeconds:0.0} 秒", false);
        return Json(200, new { ok = true, images, files, duration = Math.Round(stopwatch.Elapsed.TotalSeconds, 1) });
    }

    private static (string FileName, string ArgumentsPrefix) ResolvePython()
    {
        foreach (var candidate in new[] { ("python", ""), ("python3", ""), ("py", "-3 ") })
        {
            try
            {
                using var probe = Process.Start(new ProcessStartInfo
                {
                    FileName = candidate.Item1,
                    Arguments = "--version",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                });
                if (probe is null) continue;
                probe.StandardOutput.ReadToEnd();
                if (!probe.WaitForExit(10000)) { try { probe.Kill(); } catch { } continue; }
                if (probe.ExitCode == 0) return candidate;
            }
            catch { }
        }
        throw new InvalidOperationException("没有找到 Python，请安装 Python 3 并加入 PATH 后重试");
    }

    private static string TailText(string? value, int maxLength)
    {
        var text = (value ?? "").Trim();
        if (text.Length <= maxLength) return text;
        return "…" + text[^maxLength..];
    }

    // ---- Photoshop CEP 面板（demo）----
    // 面板源文件随包分发：源码版 {数据根}\cep-panel\CanvasFlowPanel，安装版 csproj 复制到 {安装目录}\app\cep-panel。
    // 安装 = 拷贝到 %APPDATA%\Adobe\CEP\extensions\CanvasFlowPanel + HKCU 写 CSXS PlayerDebugMode（未签名面板必需）。
    // 只在用户点击安装按钮时执行：不自动补装、不写 HKLM、不调用脚本进程、不删除用户的其他扩展。

    private string ResolveCepPanelSourceFolder()
    {
        var candidates = new List<string>();
        var contentRoot = _getContentRoot();
        if (!string.IsNullOrWhiteSpace(contentRoot)) candidates.Add(Path.Combine(contentRoot, "cep-panel", "CanvasFlowPanel"));
        candidates.Add(Path.Combine(_root, "cep-panel", "CanvasFlowPanel"));
        candidates.Add(Path.Combine(_root, "app", "cep-panel", "CanvasFlowPanel"));
        return candidates.FirstOrDefault(Directory.Exists) ?? candidates[^1];
    }

    private static string CepPanelInstallFolder =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Adobe", "CEP", "extensions", "CanvasFlowPanel");

    private const string CepVersionMarker = "installed-version.txt";

    private static string? ReadCepManifestVersion(string folder)
    {
        var manifestPath = Path.Combine(folder, "CSXS", "manifest.xml");
        if (!File.Exists(manifestPath)) return null;
        var match = Regex.Match(File.ReadAllText(manifestPath, Encoding.UTF8), "ExtensionBundleVersion=\"([^\"]+)\"");
        return match.Success ? match.Groups[1].Value : null;
    }

    private DesktopApiResponse CepPanelStatus()
    {
        var sourceFolder = ResolveCepPanelSourceFolder();
        var sourceVersion = ReadCepManifestVersion(sourceFolder);
        var installedVersion = "";
        var markerPath = Path.Combine(CepPanelInstallFolder, CepVersionMarker);
        if (File.Exists(markerPath)) installedVersion = File.ReadAllText(markerPath, Encoding.UTF8).Trim();
        if (string.IsNullOrWhiteSpace(installedVersion))
            installedVersion = ReadCepManifestVersion(CepPanelInstallFolder) ?? "";
        var installed = Directory.Exists(CepPanelInstallFolder) && !string.IsNullOrWhiteSpace(installedVersion);
        return Json(200, new
        {
            sourceExists = sourceVersion is not null,
            sourceVersion = sourceVersion ?? "",
            sourceFolder,
            installed,
            installedVersion,
            needsUpdate = installed && sourceVersion is not null && installedVersion != sourceVersion,
            installFolder = CepPanelInstallFolder,
        });
    }

    private DesktopApiResponse InstallCepPanel()
    {
        var sourceFolder = ResolveCepPanelSourceFolder();
        var sourceVersion = ReadCepManifestVersion(sourceFolder)
            ?? throw new InvalidDataException($"找不到面板源文件 {sourceFolder}\\CSXS\\manifest.xml（安装版需携带 cep-panel 目录，源码版请检查仓库）");
        if (Directory.Exists(CepPanelInstallFolder)) Directory.Delete(CepPanelInstallFolder, true);
        CopyDirectory(sourceFolder, CepPanelInstallFolder);
        File.WriteAllText(Path.Combine(CepPanelInstallFolder, CepVersionMarker), sourceVersion, Encoding.UTF8);
        EnableCepDebugMode();
        _log($"[CEP面板] 已安装 v{sourceVersion} 到 {CepPanelInstallFolder}，并开启 CSXS PlayerDebugMode", false);
        return Json(200, new { ok = true, version = sourceVersion, installFolder = CepPanelInstallFolder });
    }

    private DesktopApiResponse UninstallCepPanel()
    {
        if (Directory.Exists(CepPanelInstallFolder)) Directory.Delete(CepPanelInstallFolder, true);
        // PlayerDebugMode 不回收：用户可能有其他未签名扩展依赖它
        _log("[CEP面板] 已移除安装目录（保留 CEP 调试模式开关）", false);
        return Json(200, new { ok = true });
    }

    private static void CopyDirectory(string source, string target)
    {
        var prefix = Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            var destination = Path.GetFullPath(Path.Combine(target, Path.GetRelativePath(source, file)));
            if (!destination.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("面板文件路径越界");
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.Copy(file, destination, true);
        }
    }

    private static void EnableCepDebugMode()
    {
        // PS 2021~2025 分别依赖 CSXS.9~CSXS.12，全部写 1；只设值不删键
        foreach (var version in new[] { "9", "10", "11", "12" })
        {
            using var key = Registry.CurrentUser.CreateSubKey($"Software\\Adobe\\CSXS.{version}");
            key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);
        }
    }

    private static DesktopApiResponse Json(int status, object value) =>
        new(status, JsonSerializer.Serialize(value));

    private static DesktopApiResponse MethodNotAllowed() => Json(405, new { error = "请求方法不受支持" });
}
