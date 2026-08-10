using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CanvasFlow.Desktop;

internal sealed record DesktopApiResponse(int Status, string Body, string ContentType = "application/json;charset=utf-8");

internal sealed class DesktopApi
{
    private const int MaxBodyCharacters = 180 * 1024 * 1024;
    private readonly string _root;
    private readonly Action<string, bool> _log;

    public DesktopApi(string root, Action<string, bool> log)
    {
        _root = Path.GetFullPath(root);
        _log = log;
    }

    public Task<DesktopApiResponse> HandleLocalAsync(string method, string pathAndQuery, string body, CancellationToken cancellationToken)
    {
        if (body.Length > MaxBodyCharacters) return Task.FromResult(Json(413, new { error = "请求内容超过128MB限制" }));
        return Task.Run(() => HandleLocal(method.ToUpperInvariant(), pathAndQuery, body), cancellationToken);
    }

    private DesktopApiResponse HandleLocal(string method, string pathAndQuery, string body)
    {
        try
        {
            var uri = new Uri("https://canvasflow.local" + (pathAndQuery.StartsWith('/') ? pathAndQuery : "/" + pathAndQuery));
            var path = uri.AbsolutePath;
            if (method == "GET" && path == "/api/runtime-paths")
                return Json(200, new { dataRoot = _root, exportFolder = Path.Combine(_root, "export") });
            if (path == "/api/app-state") return HandleAppState(method, body);
            if (path == "/api/custom-library") return HandleCustomLibrary(method, body);
            if (method == "POST" && path == "/api/auto-backup") return SaveAutoBackup(body);
            if (method == "POST" && path == "/api/save-json") return SaveJson(body);
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
            var content = File.Exists(filePath) ? File.ReadAllText(filePath, Encoding.UTF8) : "{\"textTemplates\":[],\"imageMaterials\":[]}";
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
        foreach (var file in request.GetProperty("files").EnumerateArray())
        {
            var relative = SafeRelativePath(file.GetProperty("name").GetString());
            var target = Path.GetFullPath(Path.Combine(exportDirectory, relative));
            if (!target.StartsWith(exportPrefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("导出文件超出目标目录");
            WriteBase64File(target, file.GetProperty("data").GetString() ?? "");
        }
        return Json(200, new { success = true, path = exportDirectory });
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
