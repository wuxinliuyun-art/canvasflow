using System.Security.Cryptography;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CanvasFlow.Desktop;

internal static class Program
{
    private const string ProtocolVersion = "2024-11-05";
    private static readonly Dictionary<string, string> SavedTasks = new(StringComparer.Ordinal);
    private static string _root = "";
    private static DesktopApi? _api;

    public static async Task<int> Main()
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            _root = ResolveRoot();
            var version = ReadVersion();
            var updates = new WebUpdateManager(_root, _root, version, Log);
            _api = new DesktopApi(_root, Log, () => ReadApiKey("apimart"), updates, () => ReadApiKey("agtoken"), () => _root);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"CanvasFlow MCP startup failed: {error.Message}");
            return 1;
        }

        while (await Console.In.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            JsonNode? id = null;
            try
            {
                var request = JsonNode.Parse(line)?.AsObject() ?? throw new JsonException("Request is empty");
                id = request["id"]?.DeepClone();
                var method = request["method"]?.GetValue<string>() ?? "";
                if (method.StartsWith("notifications/", StringComparison.Ordinal)) continue;
                var result = await DispatchAsync(method, request["params"] as JsonObject);
                await WriteAsync(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["result"] = result });
            }
            catch (Exception error)
            {
                if (id is null) continue;
                await WriteAsync(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["error"] = new JsonObject { ["code"] = -32603, ["message"] = error.Message } });
            }
        }
        return 0;
    }

    private static async Task<JsonNode> DispatchAsync(string method, JsonObject? parameters) => method switch
    {
        "initialize" => new JsonObject
        {
            ["protocolVersion"] = ProtocolVersion,
            ["capabilities"] = new JsonObject { ["tools"] = new JsonObject { ["listChanged"] = false } },
            ["serverInfo"] = new JsonObject { ["name"] = "canvasflow", ["version"] = ReadVersion() }
        },
        "ping" => new JsonObject(),
        "tools/list" => new JsonObject { ["tools"] = ToolDefinitions() },
        "tools/call" => await CallToolAsync(parameters),
        _ => throw new InvalidOperationException($"Unsupported MCP method: {method}")
    };

    private static JsonArray ToolDefinitions() =>
    [
        Tool("canvasflow_status", "检查本机 CanvasFlow、绘图密钥和导出目录。不会发起绘图。", new JsonObject
        {
            ["type"] = "object", ["properties"] = new JsonObject(), ["additionalProperties"] = false
        }, false),
        Tool("canvasflow_start_generation", "通过 CanvasFlow 已配置的绘图服务提交图片生成任务。该操作可能产生费用，必须显式确认。", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["prompt"] = StringSchema("完整绘图提示词"),
                ["model"] = StringSchema("CanvasFlow 模型 ID，例如 gpt-image-2.5-flare 或 gpt-image-2.5-sunburst"),
                ["resolution"] = StringSchema("1K、2K 或 4K"),
                ["aspect_ratio"] = StringSchema("例如 1:1、16:9 或 3:2"),
                ["confirm_paid_generation"] = new JsonObject { ["type"] = "boolean", ["description"] = "确认提交可能计费的真实生成任务" }
            },
            ["required"] = new JsonArray("prompt", "confirm_paid_generation"),
            ["additionalProperties"] = false
        }, true),
        Tool("canvasflow_get_generation", "查询 CanvasFlow 生成任务；完成后可下载到 CanvasFlow 的 export/ai_generated/Codex特效素材。", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["task_id"] = StringSchema("canvasflow_start_generation 返回的任务 ID"),
                ["save_result"] = new JsonObject { ["type"] = "boolean", ["description"] = "完成时保存到 CanvasFlow 导出目录，默认 true" }
            },
            ["required"] = new JsonArray("task_id"),
            ["additionalProperties"] = false
        }, false),
        Tool("canvasflow_list_outputs", "列出 CanvasFlow 的 Codex 特效素材导出结果。", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject { ["limit"] = new JsonObject { ["type"] = "integer", ["minimum"] = 1, ["maximum"] = 100 } },
            ["additionalProperties"] = false
        }, false)
    ];

    private static JsonObject Tool(string name, string description, JsonObject inputSchema, bool openWorld) => new()
    {
        ["name"] = name,
        ["description"] = description,
        ["inputSchema"] = inputSchema,
        ["annotations"] = new JsonObject
        {
            ["title"] = name,
            ["readOnlyHint"] = name is "canvasflow_status" or "canvasflow_list_outputs",
            ["destructiveHint"] = false,
            ["idempotentHint"] = name is not "canvasflow_start_generation",
            ["openWorldHint"] = openWorld
        }
    };

    private static JsonObject StringSchema(string description) => new() { ["type"] = "string", ["description"] = description };

    private static async Task<JsonObject> CallToolAsync(JsonObject? parameters)
    {
        var name = parameters?["name"]?.GetValue<string>() ?? throw new InvalidDataException("Tool name is required");
        var args = parameters?["arguments"] as JsonObject ?? new JsonObject();
        try
        {
            var payload = name switch
            {
                "canvasflow_status" => Status(),
                "canvasflow_start_generation" => await StartGenerationAsync(args),
                "canvasflow_get_generation" => await GetGenerationAsync(args),
                "canvasflow_list_outputs" => ListOutputs(args),
                _ => throw new InvalidOperationException($"Unknown CanvasFlow tool: {name}")
            };
            return ToolResult(payload, false);
        }
        catch (Exception error)
        {
            return ToolResult(new JsonObject { ["error"] = error.Message }, true);
        }
    }

    private static JsonObject Status() => new()
    {
        ["ready"] = HasApiKey("apimart") || HasApiKey("agtoken"),
        ["version"] = ReadVersion(),
        ["root"] = _root,
        ["apimart_configured"] = HasApiKey("apimart"),
        ["agtoken_configured"] = HasApiKey("agtoken"),
        ["output_directory"] = OutputDirectory()
    };

    private static async Task<JsonObject> StartGenerationAsync(JsonObject args)
    {
        if (args["confirm_paid_generation"]?.GetValue<bool>() != true)
            throw new InvalidOperationException("真实生成可能计费；confirm_paid_generation 必须为 true");
        var prompt = args["prompt"]?.GetValue<string>()?.Trim() ?? "";
        if (prompt.Length == 0) throw new InvalidDataException("prompt 不能为空");
        var requestedModel = args["model"]?.GetValue<string>()?.Trim() ?? "gpt-image-2.5-sunburst";
        var resolution = (args["resolution"]?.GetValue<string>() ?? "2K").ToUpperInvariant();
        var aspectRatio = args["aspect_ratio"]?.GetValue<string>() ?? "16:9";
        var version = requestedModel.EndsWith("sunburst", StringComparison.OrdinalIgnoreCase) ? "sunburst" : "flare";
        var model = requestedModel.StartsWith("gpt-image-2.5-", StringComparison.OrdinalIgnoreCase) ? "gpt-image-2.5-ext" : requestedModel;
        var body = new JsonObject { ["model"] = model, ["prompt"] = prompt, ["n"] = 1, ["size"] = aspectRatio, ["resolution"] = resolution };
        if (model == "gpt-image-2.5-ext") body["version"] = version;
        var response = await ApiAsync("POST", "/api/generate", body.ToJsonString(), ReadApiKey("apimart"));
        var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("CanvasFlow 返回内容无效");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
        var taskId = parsed["data"]?["id"]?.GetValue<string>() ?? parsed["data"]?[0]?["task_id"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(taskId)) throw new InvalidDataException("CanvasFlow 未返回任务 ID");
        return new JsonObject { ["task_id"] = taskId, ["status"] = "submitted", ["model"] = requestedModel, ["resolution"] = resolution, ["aspect_ratio"] = aspectRatio };
    }

    private static async Task<JsonObject> GetGenerationAsync(JsonObject args)
    {
        var taskId = args["task_id"]?.GetValue<string>()?.Trim() ?? "";
        if (taskId.Length == 0) throw new InvalidDataException("task_id 不能为空");
        var response = await ApiAsync("GET", "/api/task/" + Uri.EscapeDataString(taskId), "", ReadApiKey("apimart"));
        var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("CanvasFlow 任务响应无效");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
        var data = parsed["data"] as JsonObject ?? new JsonObject();
        var state = data["status"]?.GetValue<string>() ?? "unknown";
        var result = new JsonObject { ["task_id"] = taskId, ["status"] = state, ["progress"] = data["progress"]?.DeepClone() };
        if (state == "failed") result["error"] = data["error"]?.DeepClone();
        if (state != "completed") return result;
        var imageUrl = data["result"]?["images"]?[0]?["url"]?.GetValue<string>() ?? "";
        result["image_url_available"] = imageUrl.Length > 0;
        if (!(args["save_result"]?.GetValue<bool>() ?? true) || imageUrl.Length == 0) return result;
        if (SavedTasks.TryGetValue(taskId, out var existing) && File.Exists(existing)) { result["saved_path"] = existing; return result; }
        var download = await ApiAsync("POST", "/api/download-image", new JsonObject { ["imageUrl"] = imageUrl }.ToJsonString(), "");
        var dataUrl = (JsonNode.Parse(download.Body) as JsonObject)?["base64"]?.GetValue<string>() ?? throw new InvalidDataException("CanvasFlow 下载未返回图片");
        var safeTask = new string(taskId.Where(char.IsLetterOrDigit).Take(24).ToArray());
        if (safeTask.Length == 0) safeTask = DateTime.Now.ToString("yyyyMMddHHmmss");
        var saveBody = new JsonObject
        {
            ["baseFolder"] = "export", ["folderName"] = "ai_generated",
            ["files"] = new JsonArray(new JsonObject { ["name"] = $"Codex特效素材/{DateTime.Now:yyMMdd-HHmmss}-{safeTask}.png", ["data"] = dataUrl })
        }.ToJsonString();
        var saved = await ApiAsync("POST", "/api/save-export-files", saveBody, "");
        var savedPath = (JsonNode.Parse(saved.Body) as JsonObject)?["files"]?[0]?.GetValue<string>() ?? "";
        if (savedPath.Length > 0) SavedTasks[taskId] = savedPath;
        result["saved_path"] = savedPath;
        return result;
    }

    private static JsonObject ListOutputs(JsonObject args)
    {
        var limit = Math.Clamp(args["limit"]?.GetValue<int>() ?? 20, 1, 100);
        var directory = OutputDirectory();
        var files = Directory.Exists(directory)
            ? Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories).Select(path => new FileInfo(path)).OrderByDescending(file => file.LastWriteTimeUtc).Take(limit)
                .Select(file => (JsonNode)new JsonObject { ["path"] = file.FullName, ["size"] = file.Length, ["modified"] = file.LastWriteTime.ToString("O") })
            : Enumerable.Empty<JsonNode>();
        return new JsonObject { ["directory"] = directory, ["files"] = new JsonArray(files.ToArray()) };
    }

    private static JsonObject ToolResult(JsonObject payload, bool isError) => new()
    {
        ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = payload.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) }),
        ["structuredContent"] = payload.DeepClone(), ["isError"] = isError
    };

    private static Task<DesktopApiResponse> ApiAsync(string method, string path, string body, string key) =>
        (_api ?? throw new InvalidOperationException("CanvasFlow API is not initialized")).HandleAsync(method, path, body, key, CancellationToken.None);

    private static string ResolveRoot()
    {
        var configured = Environment.GetEnvironmentVariable("CANVASFLOW_ROOT")?.Trim();
        if (string.IsNullOrWhiteSpace(configured)) throw new InvalidOperationException("CANVASFLOW_ROOT is not configured");
        var root = Path.GetFullPath(configured);
        if (!File.Exists(Path.Combine(root, "package.json")) || !Directory.Exists(Path.Combine(root, "desktop-dotnet"))) throw new DirectoryNotFoundException($"CanvasFlow root is invalid: {root}");
        return root;
    }

    private static string ReadVersion()
    {
        using var package = JsonDocument.Parse(File.ReadAllText(Path.Combine(_root, "package.json"), Encoding.UTF8));
        return package.RootElement.GetProperty("version").GetString() ?? "0.0.0";
    }

    private static bool HasApiKey(string slot) { try { return ReadApiKey(slot).Length > 0; } catch { return false; } }

    private static string ReadApiKey(string slot)
    {
        var path = Path.Combine(_root, "data", "secrets.json");
        if (!File.Exists(path)) return "";
        using var document = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
        if (!document.RootElement.GetProperty("keys").TryGetProperty(slot, out var value)) return "";
        var encrypted = value.GetString() ?? "";
        if (encrypted.Length == 0) return "";
        var bytes = ProtectedData.Unprotect(Convert.FromBase64String(encrypted), Encoding.UTF8.GetBytes("CanvasFlow.ApiKey.v1"), DataProtectionScope.CurrentUser);
        return Encoding.UTF8.GetString(bytes);
    }

    private static string OutputDirectory() => Path.Combine(_root, "export", "ai_generated", "Codex特效素材");
    private static string ErrorMessage(JsonObject response, int status) => response["error"]?["message"]?.GetValue<string>() ?? response["error"]?.GetValue<string>() ?? $"CanvasFlow request failed (HTTP {status})";
    private static async Task WriteAsync(JsonObject response) { await Console.Out.WriteLineAsync(response.ToJsonString()); await Console.Out.FlushAsync(); }
    private static void Log(string message, bool isError) => Console.Error.WriteLine($"[{(isError ? "error" : "info")}] {message}");
}
