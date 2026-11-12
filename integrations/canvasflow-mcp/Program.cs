using System.Security.Cryptography;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CanvasFlow.Desktop;

internal static class Program
{
    private const string ProtocolVersion = "2024-11-05";
    private static readonly Dictionary<string, string> SavedTasks = new(StringComparer.Ordinal);
    private static int _localTaskSeq;
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
        Tool("canvasflow_list_canvas_groups", "列出 CanvasFlow 当前项目的画布编组：编组名称、成员节点（类型与文字/图片摘要）和位置。用于把用户提到的编组名对应到具体节点。只读，不会改动画布。", new JsonObject
        {
            ["type"] = "object", ["properties"] = new JsonObject(), ["additionalProperties"] = false
        }, false),
        Tool("canvasflow_start_generation", "通过 CanvasFlow 已配置的绘图服务提交图片生成任务。该操作可能产生费用，必须显式确认。", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["prompt"] = StringSchema("完整绘图提示词"),
                ["model"] = StringSchema("CanvasFlow 模型 ID，例如 gpt-image-2、gpt-image-2.5-flare 或 gpt-image-2.5-sunburst"),
                ["site"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("apimart", "agtoken"), ["description"] = "可选。绘图 API 站点；未填写时使用 CanvasFlow 设置 → 拓展 → MCP 中保存的默认站点" },
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
        }, false),
        Tool("canvasflow_sd_status", "检查 CanvasFlow 已保存的本地 SD / ComfyUI 地址、连接状态和工作流数量。不会提交任务。", new JsonObject
        {
            ["type"] = "object", ["properties"] = new JsonObject(), ["additionalProperties"] = false
        }, false),
        Tool("canvasflow_sd_list_workflows", "列出 CanvasFlow 本地 SD 中已经载入的工作流。", new JsonObject
        {
            ["type"] = "object", ["properties"] = new JsonObject(), ["additionalProperties"] = false
        }, false),
        Tool("canvasflow_sd_start", "使用 CanvasFlow 已保存的 ComfyUI 地址和工作流提交本地 SD 任务。必须显式确认。", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["workflow_id"] = StringSchema("canvasflow_sd_list_workflows 返回的工作流 ID"),
                ["prompt"] = StringSchema("正向提示词；抠图或放大工作流可留空"),
                ["negative_prompt"] = StringSchema("负面提示词"),
                ["seed"] = new JsonObject { ["type"] = "integer", ["minimum"] = 0 },
                ["denoise"] = new JsonObject { ["type"] = "number", ["minimum"] = 0, ["maximum"] = 1 },
                ["duration"] = new JsonObject { ["type"] = "integer", ["minimum"] = 2, ["maximum"] = 15 },
                ["resolution"] = StringSchema("0.5K、1K 或 2K"),
                ["ratio"] = StringSchema("例如 1:1、16:9 或 9:16"),
                ["image_data_url"] = StringSchema("图生图、抠图、放大、局部重绘或图生视频所需的 data URL"),
                ["mask_data_url"] = StringSchema("局部重绘所需的蒙版 data URL"),
                ["confirm_local_generation"] = new JsonObject { ["type"] = "boolean", ["description"] = "确认运行可能耗时并占用本机显卡的真实任务" }
            },
            ["required"] = new JsonArray("workflow_id", "confirm_local_generation"),
            ["additionalProperties"] = false
        }, true),
        Tool("canvasflow_sd_get", "查询本地 SD 任务；完成时默认把图片保存到 CanvasFlow 导出目录，视频返回已落盘路径。", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["task_id"] = StringSchema("canvasflow_sd_start 返回的任务 ID"),
                ["save_result"] = new JsonObject { ["type"] = "boolean", ["description"] = "完成时保存图片，默认 true" }
            },
            ["required"] = new JsonArray("task_id"), ["additionalProperties"] = false
        }, false),
        Tool("canvasflow_sd_cancel", "取消指定的本地 SD / ComfyUI 任务。", new JsonObject
        {
            ["type"] = "object", ["properties"] = new JsonObject { ["task_id"] = StringSchema("要取消的本地 SD 任务 ID") },
            ["required"] = new JsonArray("task_id"), ["additionalProperties"] = false
        }, true)
    ];

    private static JsonObject Tool(string name, string description, JsonObject inputSchema, bool openWorld) => new()
    {
        ["name"] = name,
        ["description"] = description,
        ["inputSchema"] = inputSchema,
        ["annotations"] = new JsonObject
        {
            ["title"] = name,
            ["readOnlyHint"] = name is "canvasflow_status" or "canvasflow_list_outputs" or "canvasflow_list_canvas_groups" or "canvasflow_sd_status" or "canvasflow_sd_list_workflows" or "canvasflow_sd_get",
            ["destructiveHint"] = name is "canvasflow_sd_cancel",
            ["idempotentHint"] = name is not ("canvasflow_start_generation" or "canvasflow_sd_start"),
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
                "canvasflow_list_canvas_groups" => await ListCanvasGroupsAsync(),
                "canvasflow_start_generation" => await StartGenerationAsync(args),
                "canvasflow_get_generation" => await GetGenerationAsync(args),
                "canvasflow_list_outputs" => ListOutputs(args),
                "canvasflow_sd_status" => await SdStatusAsync(),
                "canvasflow_sd_list_workflows" => await SdListWorkflowsAsync(),
                "canvasflow_sd_start" => await SdStartAsync(args),
                "canvasflow_sd_get" => await SdGetAsync(args),
                "canvasflow_sd_cancel" => await SdCancelAsync(args),
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

    // 画布编组列表：走桌面端 GET /api/canvas-groups（读 app-state.json 当前页），
    // 用户在画布上给编组起名后，AI 通过本工具即可知道“角色A”这类名字对应哪些节点
    private static async Task<JsonObject> ListCanvasGroupsAsync()
    {
        var response = await ApiAsync("GET", "/api/canvas-groups", "", "");
        var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("CanvasFlow 编组响应无效");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
        return parsed;
    }

    private static async Task<JsonObject> SdStatusAsync()
    {
        var config = await ComfyConfigAsync();
        var serverUrl = config["config"]?["serverUrl"]?.GetValue<string>() ?? "";
        var workflows = config["workflows"] as JsonArray ?? new JsonArray();
        var result = new JsonObject { ["configured"] = serverUrl.Length > 0, ["server_url"] = serverUrl, ["workflow_count"] = workflows.Count, ["connected"] = false };
        if (serverUrl.Length == 0) return result;
        try
        {
            var response = await ApiAsync("POST", "/api/comfyui/test", new JsonObject { ["serverUrl"] = serverUrl }.ToJsonString(), "");
            result["connected"] = response.Status is >= 200 and < 300;
            if (response.Status is < 200 or >= 300) result["error"] = ErrorMessage(JsonNode.Parse(response.Body) as JsonObject ?? new JsonObject(), response.Status);
        }
        catch (Exception error) { result["error"] = error.Message; }
        return result;
    }

    private static async Task<JsonObject> SdListWorkflowsAsync()
    {
        var config = await ComfyConfigAsync();
        var workflows = new JsonArray();
        foreach (var node in config["workflows"] as JsonArray ?? new JsonArray())
        {
            if (node is not JsonObject item) continue;
            workflows.Add(new JsonObject
            {
                ["id"] = item["id"]?.DeepClone(), ["name"] = item["name"]?.DeepClone(), ["type"] = item["type"]?.DeepClone(),
                ["template_id"] = item["templateId"]?.DeepClone(), ["updated_at"] = item["updatedAt"]?.DeepClone()
            });
        }
        return new JsonObject
        {
            ["server_url"] = config["config"]?["serverUrl"]?.DeepClone(), ["workflow_count"] = workflows.Count, ["workflows"] = workflows
        };
    }

    private static async Task<JsonObject> SdStartAsync(JsonObject args)
    {
        if (args["confirm_local_generation"]?.GetValue<bool>() != true)
            throw new InvalidOperationException("本地生成会占用本机显卡并可能持续较长时间；confirm_local_generation 必须为 true");
        var workflowId = args["workflow_id"]?.GetValue<string>()?.Trim() ?? "";
        if (workflowId.Length == 0) throw new InvalidDataException("workflow_id 不能为空");
        var body = new JsonObject
        {
            ["workflowId"] = workflowId,
            ["prompt"] = args["prompt"]?.DeepClone() ?? "",
            ["negativePrompt"] = args["negative_prompt"]?.DeepClone() ?? "",
            ["seed"] = args["seed"]?.DeepClone(), ["denoise"] = args["denoise"]?.DeepClone(),
            ["duration"] = args["duration"]?.DeepClone(), ["resolution"] = args["resolution"]?.DeepClone(), ["ratio"] = args["ratio"]?.DeepClone(),
            ["imageData"] = args["image_data_url"]?.DeepClone() ?? "", ["maskData"] = args["mask_data_url"]?.DeepClone() ?? ""
        };
        var response = await ApiAsync("POST", "/api/comfyui/run", body.ToJsonString(), "");
        var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("本地 SD 提交响应无效");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
        return new JsonObject
        {
            ["task_id"] = parsed["taskId"]?.DeepClone(), ["prompt_id"] = parsed["promptId"]?.DeepClone(), ["workflow_id"] = workflowId, ["status"] = "submitted"
        };
    }

    private static async Task<JsonObject> SdGetAsync(JsonObject args)
    {
        var taskId = ValidateTaskId(args);
        var response = await ApiAsync("GET", "/api/comfyui/status/" + Uri.EscapeDataString(taskId), "", "");
        var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("本地 SD 状态响应无效");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
        var status = parsed["status"]?.GetValue<string>() ?? "unknown";
        var result = new JsonObject { ["task_id"] = taskId, ["status"] = status };
        if (status != "succeeded")
        {
            if (parsed["error"] is not null) result["error"] = parsed["error"]!.DeepClone();
            return result;
        }
        var images = parsed["images"] as JsonArray ?? new JsonArray();
        var videos = parsed["videos"] as JsonArray ?? new JsonArray();
        result["image_count"] = images.Count; result["video_count"] = videos.Count;
        if (parsed["videoPaths"] is JsonArray videoPaths) result["video_paths"] = videoPaths.DeepClone();
        if (!(args["save_result"]?.GetValue<bool>() ?? true) || images.Count == 0) return result;
        var files = new JsonArray();
        var stamp = DateTime.Now.ToString("yyMMdd-HHmmss");
        for (var index = 0; index < images.Count; index++)
        {
            var data = images[index]?.GetValue<string>() ?? "";
            if (data.StartsWith("data:", StringComparison.Ordinal)) files.Add(new JsonObject { ["name"] = $"MCP本地SD/{stamp}-{index + 1}.png", ["data"] = data });
        }
        if (files.Count == 0) return result;
        var saveBody = new JsonObject { ["baseFolder"] = "export", ["folderName"] = "ai_generated", ["files"] = files }.ToJsonString();
        var saved = await ApiAsync("POST", "/api/save-export-files", saveBody, "");
        var savedObject = JsonNode.Parse(saved.Body) as JsonObject ?? new JsonObject();
        if (saved.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(savedObject, saved.Status));
        result["saved_paths"] = savedObject["files"]?.DeepClone() ?? new JsonArray();
        return result;
    }

    private static async Task<JsonObject> SdCancelAsync(JsonObject args)
    {
        var taskId = ValidateTaskId(args);
        var response = await ApiAsync("POST", "/api/comfyui/cancel", new JsonObject { ["taskId"] = taskId }.ToJsonString(), "");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException("取消本地 SD 任务失败（HTTP " + response.Status + "）");
        return new JsonObject { ["task_id"] = taskId, ["status"] = "cancelled" };
    }

    private static async Task<JsonObject> ComfyConfigAsync()
    {
        var response = await ApiAsync("GET", "/api/comfyui/config", "", "");
        var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("本地 SD 配置响应无效");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
        return parsed;
    }

    private static string ValidateTaskId(JsonObject args)
    {
        var taskId = args["task_id"]?.GetValue<string>()?.Trim() ?? "";
        if (!Regex.IsMatch(taskId, @"^[A-Za-z0-9._:-]{1,200}$")) throw new InvalidDataException("task_id 格式不正确");
        return taskId;
    }

    private static async Task<JsonObject> StartGenerationAsync(JsonObject args)
    {
        if (args["confirm_paid_generation"]?.GetValue<bool>() != true)
            throw new InvalidOperationException("真实生成可能计费；confirm_paid_generation 必须为 true");
        var prompt = args["prompt"]?.GetValue<string>()?.Trim() ?? "";
        if (prompt.Length == 0) throw new InvalidDataException("prompt 不能为空");
        var requestedModel = args["model"]?.GetValue<string>()?.Trim() ?? "gpt-image-2.5-sunburst";
        var resolution = (args["resolution"]?.GetValue<string>() ?? "2K").ToUpperInvariant();
        var aspectRatio = args["aspect_ratio"]?.GetValue<string>() ?? "16:9";
        var site = (args["site"]?.GetValue<string>()?.Trim() ?? ReadDefaultApiSite()).ToLowerInvariant();
        if (site is not ("apimart" or "agtoken")) throw new InvalidDataException("site 只支持 apimart 或 agtoken");
        return site == "agtoken"
            ? await StartAgtokenGenerationAsync(requestedModel, prompt, resolution, aspectRatio)
            : await StartApimartGenerationAsync(requestedModel, prompt, resolution, aspectRatio);
    }

    private static async Task<JsonObject> StartApimartGenerationAsync(string requestedModel, string prompt, string resolution, string aspectRatio)
    {
        var version = requestedModel.EndsWith("sunburst", StringComparison.OrdinalIgnoreCase) ? "sunburst" : "flare";
        var model = requestedModel.StartsWith("gpt-image-2.5-", StringComparison.OrdinalIgnoreCase) ? "gpt-image-2.5-ext" : requestedModel;
        var body = new JsonObject { ["model"] = model, ["prompt"] = prompt, ["n"] = 1, ["size"] = aspectRatio, ["resolution"] = resolution };
        if (model == "gpt-image-2.5-ext") body["version"] = version;
        var response = await ApiAsync("POST", "/api/generate", body.ToJsonString(), ReadApiKey("apimart"));
        var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("CanvasFlow 返回内容无效");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
        var dataNode = parsed["data"];
        string? taskId = null;
        if (dataNode is JsonObject dataObject) taskId = dataObject["id"]?.GetValue<string>();
        else if (dataNode is JsonArray dataArray && dataArray.Count > 0) taskId = dataArray[0]?["task_id"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(taskId)) throw new InvalidDataException("CanvasFlow 未返回任务 ID");
        return new JsonObject { ["task_id"] = taskId, ["status"] = "submitted", ["site"] = "apimart", ["model"] = requestedModel, ["resolution"] = resolution, ["aspect_ratio"] = aspectRatio };
    }

    // agtoken 是同步直连（上游可能 60-180 秒才返回）：工具调用立即返回本地伪任务号，
    // 真实请求放到后台 Task，状态写入 data/mcp-tasks/<id>.json，get_generation 读该文件。
    private static async Task<JsonObject> StartAgtokenGenerationAsync(string model, string prompt, string resolution, string aspectRatio)
    {
        var key = ReadApiKey("agtoken");
        if (key.Length == 0) throw new InvalidOperationException("未配置 agtoken 密钥（CanvasFlow 设置 → AI绘图 → agtoken 站点）");
        CleanupOldLocalTasks();
        var taskId = $"mcp-agt-{DateTime.Now:yyyyMMddHHmmss}-{Interlocked.Increment(ref _localTaskSeq)}";
        var payload = new JsonObject
        {
            ["model"] = model, ["prompt"] = prompt, ["n"] = 1, ["size"] = resolution.ToLowerInvariant()
        };
        if (!string.IsNullOrWhiteSpace(aspectRatio) && aspectRatio != "auto") payload["aspect_ratio"] = aspectRatio;
        var state = new JsonObject
        {
            ["task_id"] = taskId, ["site"] = "agtoken", ["model"] = model, ["status"] = "running",
            ["started"] = DateTime.UtcNow.ToString("O")
        };
        WriteLocalTaskState(taskId, state);
        _ = Task.Run(async () =>
        {
            try
            {
                var response = await ApiAsync("POST", "/api/agtoken/generate", payload.ToJsonString(), key);
                var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("agtoken 响应无效");
                if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
                var images = new JsonArray();
                foreach (var item in parsed["data"] as JsonArray ?? new JsonArray())
                {
                    var b64 = item?["b64_json"]?.GetValue<string>() ?? "";
                    var url = item?["url"]?.GetValue<string>() ?? "";
                    if (b64.Length > 0) images.Add(b64.StartsWith("data:", StringComparison.Ordinal) ? b64 : $"data:image/png;base64,{b64}");
                    else if (url.Length > 0) images.Add(url);
                }
                if (images.Count == 0) throw new InvalidDataException("agtoken 生成完成但无图片结果");
                state["status"] = "completed";
                state["images"] = images;
                state["finished"] = DateTime.UtcNow.ToString("O");
                WriteLocalTaskState(taskId, state);
            }
            catch (Exception error)
            {
                state["status"] = "failed";
                state["error"] = error.Message;
                state["finished"] = DateTime.UtcNow.ToString("O");
                WriteLocalTaskState(taskId, state);
                Log($"agtoken generation {taskId} failed: {error.Message}", true);
            }
        });
        return new JsonObject { ["task_id"] = taskId, ["status"] = "submitted", ["site"] = "agtoken", ["model"] = model, ["resolution"] = resolution, ["aspect_ratio"] = aspectRatio };
    }

    private static async Task<JsonObject> GetGenerationAsync(JsonObject args)
    {
        var taskId = args["task_id"]?.GetValue<string>()?.Trim() ?? "";
        if (taskId.Length == 0) throw new InvalidDataException("task_id 不能为空");
        if (taskId.StartsWith("mcp-agt-", StringComparison.Ordinal)) return await GetLocalTaskAsync(taskId, args);
        var response = await ApiAsync("GET", "/api/task/" + Uri.EscapeDataString(taskId), "", ReadApiKey("apimart"));
        var parsed = JsonNode.Parse(response.Body) as JsonObject ?? throw new InvalidDataException("CanvasFlow 任务响应无效");
        if (response.Status is < 200 or >= 300) throw new InvalidOperationException(ErrorMessage(parsed, response.Status));
        var data = parsed["data"] as JsonObject ?? new JsonObject();
        var state = data["status"]?.GetValue<string>() ?? "unknown";
        var result = new JsonObject { ["task_id"] = taskId, ["status"] = state, ["progress"] = data["progress"]?.DeepClone() };
        if (state == "failed") result["error"] = data["error"]?.DeepClone();
        if (state != "completed") return result;
        // 上游 url 字段实测可能是字符串或数组（如 ["https://..."]），两种都兼容
        var urlNode = data["result"]?["images"]?[0]?["url"];
        var imageUrl = urlNode switch
        {
            JsonArray urlArray when urlArray.Count > 0 => urlArray[0]?.GetValue<string>() ?? "",
            JsonValue urlValue when urlValue.TryGetValue<string>(out var single) => single,
            _ => ""
        };
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

    // 本地伪任务（agtoken 同步直连）的状态文件读取与落盘保存
    private static async Task<JsonObject> GetLocalTaskAsync(string taskId, JsonObject args)
    {
        var path = LocalTaskPath(taskId);
        if (!File.Exists(path)) throw new InvalidDataException("本地任务不存在或已被清理：" + taskId);
        var state = JsonNode.Parse(File.ReadAllText(path, Encoding.UTF8)) as JsonObject ?? throw new InvalidDataException("任务状态文件无效");
        var status = state["status"]?.GetValue<string>() ?? "unknown";
        var result = new JsonObject { ["task_id"] = taskId, ["site"] = "agtoken", ["model"] = state["model"]?.DeepClone(), ["status"] = status };
        if (status == "running")
        {
            var idle = DateTime.UtcNow - File.GetLastWriteTimeUtc(path);
            result["elapsed_seconds"] = (int)idle.TotalSeconds;
            if (idle > TimeSpan.FromMinutes(15))
            {
                result["status"] = "failed";
                result["error"] = "任务超过 15 分钟无进展（MCP 进程可能被中断），请重新提交";
            }
            return result;
        }
        if (status == "failed") { result["error"] = state["error"]?.DeepClone(); return result; }
        if (status != "completed") return result;
        var images = state["images"] as JsonArray ?? new JsonArray();
        result["image_count"] = images.Count;
        if (!(args["save_result"]?.GetValue<bool>() ?? true) || images.Count == 0) return result;
        if (SavedTasks.TryGetValue(taskId, out var existing) && File.Exists(existing)) { result["saved_path"] = existing; return result; }
        var safeTask = new string(taskId.Where(char.IsLetterOrDigit).Take(24).ToArray());
        if (safeTask.Length == 0) safeTask = DateTime.Now.ToString("yyyyMMddHHmmss");
        var savedPaths = new JsonArray();
        foreach (var node in images)
        {
            var value = node?.GetValue<string>() ?? "";
            string dataUrl;
            if (value.StartsWith("data:", StringComparison.Ordinal)) dataUrl = value;
            else
            {
                var download = await ApiAsync("POST", "/api/download-image", new JsonObject { ["imageUrl"] = value }.ToJsonString(), "");
                dataUrl = (JsonNode.Parse(download.Body) as JsonObject)?["base64"]?.GetValue<string>() ?? "";
                if (dataUrl.Length == 0) continue;
            }
            var saveBody = new JsonObject
            {
                ["baseFolder"] = "export", ["folderName"] = "ai_generated",
                ["files"] = new JsonArray(new JsonObject { ["name"] = $"Codex特效素材/{DateTime.Now:yyMMdd-HHmmss}-{safeTask}-{savedPaths.Count + 1}.png", ["data"] = dataUrl })
            }.ToJsonString();
            var saved = await ApiAsync("POST", "/api/save-export-files", saveBody, "");
            var savedPath = (JsonNode.Parse(saved.Body) as JsonObject)?["files"]?[0]?.GetValue<string>() ?? "";
            if (savedPath.Length > 0) savedPaths.Add(savedPath);
        }
        if (savedPaths.Count > 0)
        {
            var first = savedPaths[0]?.GetValue<string>() ?? "";
            if (first.Length > 0) SavedTasks[taskId] = first;
        }
        result["saved_path"] = savedPaths.Count > 0 ? savedPaths[0]?.GetValue<string>() : "";
        if (savedPaths.Count > 1) result["saved_paths"] = savedPaths.DeepClone();
        return result;
    }

    private static string LocalTaskPath(string taskId)
    {
        if (!Regex.IsMatch(taskId, @"^[A-Za-z0-9._:-]{1,200}$")) throw new InvalidDataException("任务编号格式不正确");
        return Path.Combine(_root, "data", "mcp-tasks", taskId + ".json");
    }

    private static void WriteLocalTaskState(string taskId, JsonObject state)
    {
        var path = LocalTaskPath(taskId);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, state.ToJsonString(), Encoding.UTF8);
    }

    private static void CleanupOldLocalTasks()
    {
        var directory = Path.Combine(_root, "data", "mcp-tasks");
        if (!Directory.Exists(directory)) return;
        foreach (var file in Directory.EnumerateFiles(directory, "*.json"))
        {
            try { if (File.GetLastWriteTimeUtc(file) < DateTime.UtcNow.AddDays(-2)) File.Delete(file); }
            catch { /* 单个文件清理失败不影响提交 */ }
        }
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
        if (!string.IsNullOrWhiteSpace(configured))
        {
            var configuredRoot = Path.GetFullPath(configured);
            if (IsCanvasFlowRoot(configuredRoot)) return configuredRoot;
            throw new DirectoryNotFoundException($"CANVASFLOW_ROOT is invalid: {configuredRoot}");
        }

        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (IsCanvasFlowRoot(directory.FullName)) return directory.FullName;
        }

        var commonRoots = new[]
        {
            @"D:\CanvasFlow",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "CanvasFlow")
        };
        foreach (var candidate in commonRoots)
        {
            if (IsCanvasFlowRoot(candidate)) return Path.GetFullPath(candidate);
        }

        throw new DirectoryNotFoundException("CanvasFlow was not found. Run the MCP from CanvasFlow's app\\mcp folder, or set CANVASFLOW_ROOT to the CanvasFlow install folder.");
    }

    private static bool IsCanvasFlowRoot(string path) =>
        IsSourceRoot(path) || IsInstalledRoot(path);

    private static bool IsSourceRoot(string path) =>
        File.Exists(Path.Combine(path, "package.json")) &&
        Directory.Exists(Path.Combine(path, "desktop-dotnet"));

    private static bool IsInstalledRoot(string path) =>
        File.Exists(Path.Combine(path, "app", "package.json")) &&
        File.Exists(Path.Combine(path, "app", "CanvasFlow.exe"));

    private static string PackageJsonPath() => IsSourceRoot(_root)
        ? Path.Combine(_root, "package.json")
        : Path.Combine(_root, "app", "package.json");

    private static string ReadVersion()
    {
        using var package = JsonDocument.Parse(File.ReadAllText(PackageJsonPath(), Encoding.UTF8));
        return package.RootElement.GetProperty("version").GetString() ?? "0.0.0";
    }

    private static bool HasApiKey(string slot) { try { return ReadApiKey(slot).Length > 0; } catch { return false; } }

    private static string ReadDefaultApiSite()
    {
        try
        {
            var path = Path.Combine(_root, "data", "mcp-settings.json");
            if (!File.Exists(path)) return "apimart";
            using var document = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
            var value = document.RootElement.TryGetProperty("apiSite", out var site) ? site.GetString() : null;
            return value is "agtoken" ? "agtoken" : "apimart";
        }
        catch { return "apimart"; }
    }

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
