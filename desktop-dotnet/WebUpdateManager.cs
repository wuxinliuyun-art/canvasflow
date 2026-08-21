using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Linq;

namespace CanvasFlow.Desktop;

internal sealed class WebUpdateManager
{
    private static readonly string[] RequiredFiles = ["index.html", "app.js", "styles.css", "canvas-runtime.js"];
    private readonly string _bundledRoot;
    private readonly string _updateRoot;
    private readonly string _versionsRoot;
    private readonly string _pointerPath;
    private readonly string _hostVersion;
    private readonly Action<string, bool> _log;

    private sealed record UpdatePointer(string ActiveVersion, string PreviousVersion, string PendingVersion = "");
    private sealed record WebManifest(string Version, string MinimumHostVersion, string Entry, Dictionary<string, string> Files);

    public WebUpdateManager(string dataRoot, string bundledRoot, string hostVersion, Action<string, bool> log)
    {
        _bundledRoot = Path.GetFullPath(bundledRoot);
        _updateRoot = Path.Combine(Path.GetFullPath(dataRoot), "data", "web-updates");
        _versionsRoot = Path.Combine(_updateRoot, "versions");
        _pointerPath = Path.Combine(_updateRoot, "active.json");
        _hostVersion = hostVersion;
        _log = log;
    }

    public string ActiveVersion { get; private set; } = "";
    public string CurrentContentRoot => string.IsNullOrWhiteSpace(ActiveVersion) ? _bundledRoot : VersionDirectory(ActiveVersion);

    public string ResolveContentRoot()
    {
        Directory.CreateDirectory(_versionsRoot);
        var pointer = ReadPointer();
        var activeFailedBeforeReady = !string.IsNullOrWhiteSpace(pointer?.PendingVersion)
            && string.Equals(pointer.PendingVersion, pointer.ActiveVersion, StringComparison.OrdinalIgnoreCase);
        if (activeFailedBeforeReady) _log($"[界面热更新] {pointer!.ActiveVersion} 上次未完成启动确认，回退到 {pointer.PreviousVersion}。", true);
        var candidates = activeFailedBeforeReady
            ? new[] { pointer?.PreviousVersion }
            : new[] { pointer?.ActiveVersion, pointer?.PreviousVersion };
        foreach (var version in candidates.Where(value => !string.IsNullOrWhiteSpace(value)).Distinct())
        {
            var candidate = VersionDirectory(version!);
            try
            {
                ValidateInstalledVersion(candidate, version!);
                ActiveVersion = version!;
                if (!string.Equals(pointer?.ActiveVersion, version, StringComparison.OrdinalIgnoreCase))
                    WritePointer(new UpdatePointer(version!, ""));
                _log($"[界面热更新] 使用版本 {version}。", false);
                return candidate;
            }
            catch (Exception error)
            {
                _log($"[界面热更新] 版本 {version} 无法载入，尝试回退。详细信息：{error.Message}", true);
            }
        }
        ActiveVersion = "";
        if (pointer is not null) WritePointer(new UpdatePointer("", ""));
        return _bundledRoot;
    }

    public async Task<object> DownloadAndApplyAsync(string url, string digest, string expectedVersion, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps || !uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("热更新下载地址不是受信任的 GitHub HTTPS 地址");
        if (!TryDigest(digest, out var expectedDigest)) throw new InvalidDataException("热更新包缺少 GitHub SHA-256 校验值，请改用完整安装包");

        Directory.CreateDirectory(_updateRoot);
        var operationId = $"{Environment.ProcessId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        var zipPath = Path.Combine(_updateRoot, $"download-{operationId}.zip");
        var staging = Path.Combine(_updateRoot, "staging", operationId);
        try
        {
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true, AutomaticDecompression = DecompressionMethods.All }) { Timeout = TimeSpan.FromMinutes(5) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd($"CanvasFlow/{_hostVersion}");
            using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength is > 64 * 1024 * 1024) throw new InvalidDataException("热更新包超过 64MB 限制");
            await using (var output = new FileStream(zipPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                await response.Content.CopyToAsync(output, cancellationToken);
            if (new FileInfo(zipPath).Length > 64 * 1024 * 1024) throw new InvalidDataException("热更新包超过 64MB 限制");
            string actualDigest;
            await using (var input = File.OpenRead(zipPath)) actualDigest = Convert.ToHexString(await SHA256.HashDataAsync(input, cancellationToken));
            if (!actualDigest.Equals(expectedDigest, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("热更新包 SHA-256 校验失败");

            Directory.CreateDirectory(staging);
            ExtractSafely(zipPath, staging);
            var manifest = ReadManifest(staging);
            if (!string.Equals(NormalizeVersion(manifest.Version), NormalizeVersion(expectedVersion), StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"热更新清单版本 {manifest.Version} 与 Release {expectedVersion} 不一致");
            if (IsNewerVersion(manifest.MinimumHostVersion, _hostVersion))
                throw new InvalidDataException($"此界面需要宿主 {manifest.MinimumHostVersion}，当前宿主 {_hostVersion}；请安装完整新版");
            ValidateManifestFiles(staging, manifest);

            var version = NormalizeVersion(manifest.Version);
            var destination = VersionDirectory(version);
            if (Directory.Exists(destination))
            {
                ValidateInstalledVersion(destination, version);
                TryDeleteDirectory(staging);
            }
            else
            {
                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                Directory.Move(staging, destination);
            }
            var previous = ReadPointer()?.ActiveVersion ?? ActiveVersion;
            WritePointer(new UpdatePointer(version, previous ?? "", version));
            ActiveVersion = version;
            _log($"[界面热更新] 已安装并切换到 {version}，上个版本为 {previous}。", false);
            return new { applied = true, version, contentRoot = destination, previousVersion = previous ?? "" };
        }
        catch (Exception error)
        {
            _log($"[界面热更新] 更新失败，当前版本保持不变。详细信息：{error.Message}", true);
            throw new InvalidOperationException($"界面更新没有完成。可能原因：网络中断、更新包损坏或宿主版本过旧。建议：重试，或下载完整安装包。详细信息：{error.Message}", error);
        }
        finally
        {
            TryDeleteFile(zipPath);
            TryDeleteDirectory(staging);
        }
    }

    public void ConfirmActiveVersionReady()
    {
        if (string.IsNullOrWhiteSpace(ActiveVersion)) return;
        var pointer = ReadPointer();
        if (pointer is null || !string.Equals(pointer.PendingVersion, ActiveVersion, StringComparison.OrdinalIgnoreCase)) return;
        WritePointer(new UpdatePointer(pointer.ActiveVersion, pointer.PreviousVersion));
        _log($"[界面热更新] {ActiveVersion} 已完成启动确认。", false);
    }

    private void ValidateInstalledVersion(string directory, string expectedVersion)
    {
        var manifest = ReadManifest(directory);
        if (!string.Equals(NormalizeVersion(manifest.Version), NormalizeVersion(expectedVersion), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("版本目录与清单不一致");
        if (IsNewerVersion(manifest.MinimumHostVersion, _hostVersion)) throw new InvalidDataException("宿主版本过旧");
        ValidateManifestFiles(directory, manifest);
    }

    private static WebManifest ReadManifest(string directory)
    {
        var path = Path.Combine(directory, "manifest.json");
        if (!File.Exists(path)) throw new InvalidDataException("更新包缺少 manifest.json");
        return JsonSerializer.Deserialize<WebManifest>(File.ReadAllText(path, Encoding.UTF8), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidDataException("更新清单为空");
    }

    private static void ValidateManifestFiles(string directory, WebManifest manifest)
    {
        if (string.IsNullOrWhiteSpace(manifest.Version) || manifest.Files is null) throw new InvalidDataException("更新清单字段不完整");
        foreach (var required in RequiredFiles) if (!manifest.Files.ContainsKey(required)) throw new InvalidDataException($"更新清单缺少 {required}");
        foreach (var item in manifest.Files)
        {
            var path = SafeChildPath(directory, item.Key);
            if (!File.Exists(path)) throw new InvalidDataException($"更新包缺少 {item.Key}");
            var digest = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)));
            if (!digest.Equals(item.Value.Replace("sha256:", "", StringComparison.OrdinalIgnoreCase), StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"文件校验失败：{item.Key}");
        }
    }

    private static void ExtractSafely(string zipPath, string destination)
    {
        using var archive = ZipFile.OpenRead(zipPath);
        foreach (var entry in archive.Entries)
        {
            var path = SafeChildPath(destination, entry.FullName);
            if (string.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(path); continue; }
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            entry.ExtractToFile(path, true);
        }
    }

    private static string SafeChildPath(string root, string relative)
    {
        if (string.IsNullOrWhiteSpace(relative) || Path.IsPathRooted(relative)) throw new InvalidDataException("更新包包含非法路径");
        var normalizedRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (!path.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("更新包试图写出暂存目录");
        return path;
    }

    private UpdatePointer? ReadPointer()
    {
        try { return File.Exists(_pointerPath) ? JsonSerializer.Deserialize<UpdatePointer>(File.ReadAllText(_pointerPath, Encoding.UTF8)) : null; }
        catch (Exception error) { _log($"[界面热更新] 版本指针损坏，将使用内置界面：{error.Message}", true); return null; }
    }

    private void WritePointer(UpdatePointer pointer)
    {
        Directory.CreateDirectory(_updateRoot);
        var temporary = _pointerPath + $".{Environment.ProcessId}.tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(pointer, new JsonSerializerOptions { WriteIndented = true }), Encoding.UTF8);
        File.Move(temporary, _pointerPath, true);
    }

    private string VersionDirectory(string version) => SafeChildPath(_versionsRoot, NormalizeVersion(version));
    private static string NormalizeVersion(string value)
    {
        var normalized = value.Trim().TrimStart('v', 'V');
        if (!System.Text.RegularExpressions.Regex.IsMatch(normalized, @"^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][A-Za-z0-9.-]+)?$")) throw new InvalidDataException("版本号格式不正确");
        return normalized;
    }
    private static bool IsNewerVersion(string candidate, string current)
    {
        static int[] Parts(string value) => value.TrimStart('v', 'V').Split('.', '-', StringSplitOptions.RemoveEmptyEntries).Take(3).Select(part => int.TryParse(part, out var number) ? number : 0).Concat([0, 0, 0]).Take(3).ToArray();
        var next = Parts(candidate); var now = Parts(current);
        for (var index = 0; index < 3; index++) if (next[index] != now[index]) return next[index] > now[index];
        return false;
    }
    private static bool TryDigest(string value, out string digest)
    {
        digest = value.Replace("sha256:", "", StringComparison.OrdinalIgnoreCase).Trim();
        return digest.Length == 64 && digest.All(Uri.IsHexDigit);
    }
    private static void TryDeleteFile(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }
    private static void TryDeleteDirectory(string path) { try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch { } }
}
