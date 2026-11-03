using System.Collections.Concurrent;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CanvasFlow.Desktop;

internal sealed class ComfyUiApi
{
    private sealed record TaskState(string PromptId, string ServerUrl, string[] OutputNodeIds) { public bool Cancelled { get; set; } }
    private static readonly ConcurrentDictionary<string, TaskState> Tasks = new();
    private static readonly HashSet<string> Types = new(StringComparer.Ordinal) { "txt2img", "img2img", "upscale", "matting", "inpaint", "video-i2v", "video-t2v" };
    private static readonly string[] SamplerTypes = { "txt2img", "img2img", "inpaint", "video-i2v", "video-t2v" };
    private static readonly string[] ImageTypes = { "img2img", "upscale", "matting", "inpaint", "video-i2v" };
    private static readonly HashSet<string> VideoOutputExts = new(StringComparer.OrdinalIgnoreCase) { "mp4", "webm", "mov", "mkv", "gif" };
    private readonly string _root;
    private readonly HttpClient _http = new(new HttpClientHandler { AutomaticDecompression = System.Net.DecompressionMethods.All }) { Timeout = TimeSpan.FromSeconds(600) };

    internal ComfyUiApi(string root) => _root = root;
    private string StorePath => Path.Combine(_root, "data", "comfyui.json");

    private static DesktopApiResponse JsonResponse(int status, object value) => new(status, JsonSerializer.Serialize(value), "application/json;charset=utf-8");
    private static string NormalizeUrl(string? value)
    {
        var raw = (value ?? "").Trim().TrimEnd('/');
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https") || !string.IsNullOrEmpty(uri.UserInfo))
            throw new InvalidDataException("ComfyUI 地址只支持明确的 HTTP/HTTPS URL");
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }

    private JsonObject LoadStore()
    {
        try
        {
            var parsed = JsonNode.Parse(File.ReadAllText(StorePath, Encoding.UTF8)) as JsonObject ?? new JsonObject();
            parsed["config"] ??= new JsonObject();
            parsed["workflows"] ??= new JsonArray();
            var config = (JsonObject)parsed["config"]!;
            config["serverUrl"] ??= "http://127.0.0.1:8188";
            config["installPath"] ??= "";
            config["launchPath"] ??= "";
            return parsed;
        }
        catch { return new JsonObject { ["config"] = new JsonObject { ["serverUrl"] = "http://127.0.0.1:8188", ["installPath"] = "", ["launchPath"] = "" }, ["workflows"] = new JsonArray() }; }
    }

    private void SaveStore(JsonObject store)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(StorePath)!);
        var temp = StorePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllText(temp, store.ToJsonString(new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
        File.Move(temp, StorePath, true);
    }

    private static List<(string Id, JsonObject Node)> Nodes(JsonObject workflow)
    {
        var nodes = workflow.Select(pair => (pair.Key, pair.Value as JsonObject)).Where(pair => pair.Item2?["class_type"] is not null && pair.Item2?["inputs"] is JsonObject).Select(pair => (pair.Key, pair.Item2!)).ToList();
        if (nodes.Count == 0) throw new InvalidDataException("请选择 ComfyUI 导出的 API 格式 JSON");
        return nodes;
    }

    private static string Class(JsonObject node) => node["class_type"]?.GetValue<string>() ?? "";
    private static string Title(JsonObject node) => (node["_meta"]?["title"]?.GetValue<string>() ?? "").ToLowerInvariant();
    private static JsonObject DetectMapping(string type, JsonObject workflow)
    {
        if (!Types.Contains(type)) throw new InvalidDataException("不支持的本地 SD 功能类型");
        var nodes = Nodes(workflow);
        var texts = nodes.Where(pair => Class(pair.Node) == "CLIPTextEncode").ToList();
        var images = nodes.Where(pair => Class(pair.Node) == "LoadImage").ToList();
        var samplers = nodes.Where(pair => Class(pair.Node).Contains("KSampler", StringComparison.Ordinal)).ToList();
        var outputs = nodes.Where(pair => new[] { "SaveImage", "PreviewImage", "SaveAnimatedWEBP", "SaveVideo" }.Contains(Class(pair.Node))).ToList();
        if (outputs.Count == 0) throw new InvalidDataException("工作流缺少 SaveImage、PreviewImage 或 SaveVideo 输出节点");
        var mapping = new JsonObject { ["outputNodeIds"] = new JsonArray(outputs.Select(pair => JsonValue.Create(pair.Id)).ToArray()) };
        if (new[] { "txt2img", "img2img", "inpaint" }.Contains(type))
        {
            if (texts.Count == 0) throw new InvalidDataException("工作流缺少 CLIPTextEncode 提示词节点");
            var negative = texts.FirstOrDefault(pair => Title(pair.Node).Contains("negative") || Title(pair.Node).Contains("负面") || Title(pair.Node).Contains("反向"));
            if (negative.Node is null && texts.Count > 1) negative = texts[1];
            var positive = texts.FirstOrDefault(pair => pair.Id != negative.Id && (Title(pair.Node).Contains("positive") || Title(pair.Node).Contains("正面") || Title(pair.Node).Contains("提示词")));
            if (positive.Node is null) positive = texts.First(pair => pair.Id != negative.Id || texts.Count == 1);
            mapping["positiveNodeId"] = positive.Id; mapping["negativeNodeId"] = negative.Node is null ? "" : negative.Id;
        }
        // 采样器映射对视频类型同样生效（视频模板也用经典 KSampler，便于改 seed）；与 JS 版逐项对齐
        if (SamplerTypes.Contains(type))
        {
            if (samplers.Count > 1) throw new InvalidDataException("工作流包含多个采样器，首版无法确定要修改哪一个");
            if (samplers.Count == 1)
            {
                var inputs = (JsonObject)samplers[0].Node["inputs"]!;
                mapping["samplerNodeId"] = samplers[0].Id;
                mapping["seedField"] = inputs.ContainsKey("seed") ? "seed" : inputs.ContainsKey("noise_seed") ? "noise_seed" : "";
                mapping["denoiseField"] = inputs.ContainsKey("denoise") ? "denoise" : "";
            }
        }
        // 视频类型：提示词与时长直接写在 MiniMaxH3 节点字段上（不走 CLIPTextEncode）
        if (type == "video-i2v" || type == "video-t2v")
        {
            var h3 = nodes.Where(pair => Class(pair.Node).StartsWith("MiniMaxH3", StringComparison.Ordinal)).ToList();
            if (h3.Count != 1) throw new InvalidDataException("视频工作流需要恰好一个 MiniMaxH3 节点");
            var h3Inputs = (JsonObject)h3[0].Node["inputs"]!;
            if (!h3Inputs.ContainsKey("prompt")) throw new InvalidDataException("MiniMaxH3 节点缺少 prompt 输入");
            mapping["promptNodeId"] = h3[0].Id; mapping["promptField"] = "prompt";
            if (h3Inputs.ContainsKey("length")) { mapping["durationNodeId"] = h3[0].Id; mapping["durationField"] = "length"; }
        }
        // 通用参数传导接口（预留）：params = [{param, nodeId, field}, ...]，目前只实现 width/height。
        // 尺寸目标 = 恰好一个同时具有数值型 width/height 输入的节点；与 JS 版逐项对齐。
        if (new[] { "txt2img", "video-i2v", "video-t2v" }.Contains(type))
        {
            static bool IsNumber(JsonNode? node) => node is JsonValue value && value.TryGetValue<double>(out var number) && !double.IsNaN(number) && !double.IsInfinity(number);
            var sizeCandidates = nodes.Where(pair => IsNumber(pair.Node["inputs"]?["width"]) && IsNumber(pair.Node["inputs"]?["height"])).ToList();
            var sizeNode = sizeCandidates.Count == 1 ? sizeCandidates[0] : sizeCandidates.FirstOrDefault(pair => Class(pair.Node).Contains("Latent", StringComparison.OrdinalIgnoreCase) || Class(pair.Node).StartsWith("MiniMaxH3", StringComparison.Ordinal));
            if (sizeNode.Node is not null)
            {
                mapping["params"] = new JsonArray(
                    new JsonObject { ["param"] = "width", ["nodeId"] = sizeNode.Id, ["field"] = "width" },
                    new JsonObject { ["param"] = "height", ["nodeId"] = sizeNode.Id, ["field"] = "height" });
            }
        }
        if (ImageTypes.Contains(type))
        {
            if (images.Count == 0) throw new InvalidDataException("该功能工作流缺少 LoadImage 输入节点");
            var mask = images.FirstOrDefault(pair => Title(pair.Node).Contains("mask") || Title(pair.Node).Contains("蒙版") || Title(pair.Node).Contains("遮罩"));
            var source = images.FirstOrDefault(pair => pair.Id != mask.Id) ;
            if (source.Node is null) source = images[0];
            mapping["imageNodeId"] = source.Id;
            if (type == "inpaint")
            {
                if (mask.Node is null) throw new InvalidDataException("局部重绘工作流需要一个标题包含 mask、蒙版或遮罩的 LoadImage 节点");
                mapping["maskNodeId"] = mask.Id;
            }
        }
        if (type == "upscale" && !nodes.Any(pair => Class(pair.Node).Contains("Upscale") || Class(pair.Node).Contains("ScaleBy") || Class(pair.Node).Contains("ScaleToTotalPixels")))
            throw new InvalidDataException("放大工作流缺少可识别的 Upscale 节点");
        return mapping;
    }

    // 动画时长（秒）→ MiniMaxH3 length 帧数：24fps，17k+5 网格，与 modules/comfyui-server.js 的
    // videoFrameLength 逐项对齐（Math.Round 用 AwayFromZero 与 JS Math.round 一致）。
    private static int VideoFrameLength(JsonNode? secondsNode)
    {
        double seconds = 5;
        try { if (secondsNode is JsonValue value && value.TryGetValue<double>(out var parsed) && !double.IsNaN(parsed) && !double.IsInfinity(parsed)) seconds = parsed; } catch { }
        seconds = Math.Clamp(seconds, 2, 15);
        var frames = Math.Max(5, (int)Math.Round(seconds * 24, MidpointRounding.AwayFromZero));
        frames += (5 - (frames % 17)) % 17;
        return Math.Min(frames, 362);
    }

    // SD 尺寸档：与 AI 绘图节点的分辨率/比例语义对齐（分辨率 = 长边像素），结果 32 对齐。
    // 与 modules/comfyui-server.js 的 sdImageSize 逐项对齐（双实现纪律）。
    private static readonly Dictionary<string, int> SdResolutions = new(StringComparer.Ordinal) { ["0.5K"] = 512, ["1K"] = 1024, ["2K"] = 2048 };
    private static readonly Dictionary<string, double> SdRatios = new(StringComparer.Ordinal) { ["1:1"] = 1, ["4:3"] = 4.0 / 3, ["3:4"] = 3.0 / 4, ["16:9"] = 16.0 / 9, ["9:16"] = 9.0 / 16, ["3:2"] = 1.5, ["2:3"] = 2.0 / 3 };

    private static (int Width, int Height) SdImageSize(string? resolution, string? ratio)
    {
        var baseEdge = SdResolutions.TryGetValue(resolution ?? "", out var parsedBase) ? parsedBase : 1024;
        var ar = SdRatios.TryGetValue(ratio ?? "", out var parsedRatio) ? parsedRatio : 1;
        int Snap(double value) => (int)Math.Clamp(Math.Round(value / 32, MidpointRounding.AwayFromZero) * 32, 256, 4096);
        return ar >= 1 ? (Snap(baseEdge), Snap(baseEdge / ar)) : (Snap(baseEdge * ar), Snap(baseEdge));
    }

    private string SaveVideoFile(byte[] bytes, string ext)
    {
        var dir = Path.Combine(_root, "download", "videos");
        Directory.CreateDirectory(dir);
        var name = $"comfyui_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Guid.NewGuid().ToString("N")[..6]}.{ext}";
        File.WriteAllBytes(Path.Combine(dir, name), bytes);
        return name;
    }

    private async Task<HttpResponseMessage> SendAsync(string serverUrl, string route, HttpMethod method, HttpContent? content, CancellationToken token)
    {
        using var request = new HttpRequestMessage(method, NormalizeUrl(serverUrl) + route) { Content = content };
        try { return await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token); }
        catch (TaskCanceledException) when (!token.IsCancellationRequested) { throw new TimeoutException("连接 ComfyUI 超时"); }
        catch (HttpRequestException error) { throw new InvalidOperationException("无法连接 ComfyUI：" + error.Message); }
    }

    private static (byte[] Bytes, string Mime, string Extension) DecodeImage(string? dataUrl)
    {
        var raw = dataUrl ?? ""; var comma = raw.IndexOf(',');
        if (!raw.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) || comma < 0 || !raw[..comma].Contains(";base64", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("输入图片格式无效");
        var mime = raw[5..raw.IndexOf(';')]; var ext = mime.Contains("jpeg") ? "jpg" : mime.Split('/').Last().Replace("+", "");
        return (Convert.FromBase64String(raw[(comma + 1)..]), mime, ext);
    }

    private async Task<string> UploadAsync(string serverUrl, string? dataUrl, string prefix, CancellationToken token)
    {
        var image = DecodeImage(dataUrl);
        using var form = new MultipartFormDataContent();
        using var content = new ByteArrayContent(image.Bytes); content.Headers.ContentType = MediaTypeHeaderValue.Parse(image.Mime);
        form.Add(content, "image", $"canvasflow_{prefix}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Guid.NewGuid():N}.{image.Extension}"); form.Add(new StringContent("false"), "overwrite");
        using var response = await SendAsync(serverUrl, "/upload/image", HttpMethod.Post, form, token);
        var result = JsonNode.Parse(await response.Content.ReadAsStringAsync(token)) as JsonObject ?? new JsonObject();
        var name = result["name"]?.GetValue<string>() ?? ""; if (!response.IsSuccessStatusCode || name.Length == 0) throw new InvalidOperationException("上传图片失败");
        var sub = result["subfolder"]?.GetValue<string>() ?? ""; return sub.Length == 0 ? name : sub.TrimEnd('/') + "/" + name;
    }

    private async Task<JsonObject> PreparePrompt(JsonObject item, JsonObject body, string serverUrl, CancellationToken token)
    {
        var workflow = JsonNode.Parse(item["workflow"]!.ToJsonString())!.AsObject(); var map = item["mapping"]!.AsObject();
        void Set(string mapKey, string field, JsonNode? value) { var id = map[mapKey]?.GetValue<string>() ?? ""; if (id.Length > 0 && workflow[id]?["inputs"] is JsonObject inputs) inputs[field] = value?.DeepClone(); }
        Set("positiveNodeId", "text", body["prompt"]); Set("negativeNodeId", "text", body["negativePrompt"]);
        var promptNodeId = map["promptNodeId"]?.GetValue<string>() ?? ""; if (promptNodeId.Length > 0 && workflow[promptNodeId]?["inputs"] is JsonObject promptInputs) promptInputs[map["promptField"]?.GetValue<string>() ?? "prompt"] = body["prompt"] is JsonNode promptValue ? promptValue.DeepClone() : (JsonNode)"";
        var durationNodeId = map["durationNodeId"]?.GetValue<string>() ?? ""; if (durationNodeId.Length > 0 && workflow[durationNodeId]?["inputs"] is JsonObject durationInputs) durationInputs[map["durationField"]?.GetValue<string>() ?? "length"] = VideoFrameLength(body["duration"]);
        // 通用参数传导（预留接口，目前只开放 width/height）：与 JS 版逐项对齐
        if (map["params"] is JsonArray paramEntries)
        {
            var size = SdImageSize(body["resolution"]?.GetValue<string>(), body["ratio"]?.GetValue<string>());
            foreach (var entryNode in paramEntries.OfType<JsonObject>())
            {
                var paramName = entryNode["param"]?.GetValue<string>() ?? "";
                var entryId = entryNode["nodeId"]?.GetValue<string>() ?? "";
                if (paramName.Length == 0 || entryId.Length == 0 || workflow[entryId]?["inputs"] is not JsonObject entryInputs) continue;
                if (paramName == "width") entryInputs[entryNode["field"]?.GetValue<string>() ?? "width"] = size.Width;
                else if (paramName == "height") entryInputs[entryNode["field"]?.GetValue<string>() ?? "height"] = size.Height;
            }
        }
        var samplerId = map["samplerNodeId"]?.GetValue<string>() ?? ""; if (samplerId.Length > 0 && workflow[samplerId]?["inputs"] is JsonObject sampler)
        {
            var seedField = map["seedField"]?.GetValue<string>() ?? ""; if (seedField.Length > 0 && body["seed"] is not null) sampler[seedField] = body["seed"]!.DeepClone();
            var denoiseField = map["denoiseField"]?.GetValue<string>() ?? ""; if (denoiseField.Length > 0 && body["denoise"] is not null) sampler[denoiseField] = body["denoise"]!.DeepClone();
        }
        var imageId = map["imageNodeId"]?.GetValue<string>() ?? ""; if (imageId.Length > 0) ((JsonObject)workflow[imageId]!["inputs"]!)["image"] = await UploadAsync(serverUrl, body["imageData"]?.GetValue<string>(), "source", token);
        var maskId = map["maskNodeId"]?.GetValue<string>() ?? ""; if (maskId.Length > 0) ((JsonObject)workflow[maskId]!["inputs"]!)["image"] = await UploadAsync(serverUrl, body["maskData"]?.GetValue<string>(), "mask", token);
        return workflow;
    }

    // 按内容自动识别工作流类型（导入时不再让用户手选）；与 modules/comfyui-server.js 的 detectWorkflowType 逐项对齐
    private static string DetectWorkflowType(JsonObject workflow)
    {
        var nodes = Nodes(workflow);
        bool HasClass(string regex) => nodes.Any(pair => System.Text.RegularExpressions.Regex.IsMatch(Class(pair.Node), regex));
        var hasImageInput = nodes.Any(pair => Class(pair.Node) == "LoadImage");
        var hasMaskLoadImage = nodes.Any(pair => Class(pair.Node) == "LoadImage" && (Title(pair.Node).Contains("mask") || Title(pair.Node).Contains("蒙版") || Title(pair.Node).Contains("遮罩")));
        if (HasClass("^SaveVideo$")) return hasImageInput ? "video-i2v" : "video-t2v";
        if (hasImageInput && HasClass("SDMatte|RMBG|BiRefNet|SegmentAnything")) return "matting";
        if (hasMaskLoadImage) return "inpaint";
        if (hasImageInput && HasClass("Upscale|ScaleBy|ScaleToTotalPixels")) return "upscale";
        if (hasImageInput) return "img2img";
        return "txt2img";
    }

    private static JsonArray? ComboOptions(JsonObject objectInfo, JsonObject node, string field)
        => objectInfo[Class(node)]?["input"]?["required"]?[field]?[0] as JsonArray;

    // 内置工作流载入时的模型适配：hints = [{nodeId, field, prefer:[[token...],...]}]。
    // 与 modules/comfyui-server.js 的 fitWorkflowModels 逐项对齐（双实现纪律）。
    private static JsonObject FitWorkflowModels(JsonObject workflow, JsonArray hints, JsonObject objectInfo)
    {
        var misses = new List<string>();
        foreach (var hint in hints.OfType<JsonObject>())
        {
            var nodeId = hint["nodeId"]?.GetValue<string>() ?? "";
            var field = hint["field"]?.GetValue<string>() ?? "";
            if (nodeId.Length == 0 || field.Length == 0 || hint["prefer"] is not JsonArray prefer || workflow[nodeId]?["inputs"] is not JsonObject inputs) continue;
            var options = ComboOptions(objectInfo, (JsonObject)workflow[nodeId]!, field);
            if (options is null) continue;
            var current = inputs[field]?.GetValue<string>() ?? "";
            if (current.Length > 0 && options.OfType<JsonNode>().Any(option => option?.GetValue<string>() == current)) continue;
            var matched = "";
            foreach (var pattern in prefer.OfType<JsonArray>())
            {
                var tokens = pattern.OfType<JsonNode>().Select(token => (token?.GetValue<string>() ?? "").ToLowerInvariant()).Where(token => token.Length > 0).ToList();
                if (tokens.Count == 0) continue;
                matched = options.OfType<JsonNode>().Select(option => option?.GetValue<string>() ?? "").FirstOrDefault(name => tokens.All(token => name.ToLowerInvariant().Contains(token))) ?? "";
                if (matched.Length > 0) break;
            }
            if (matched.Length > 0) { inputs[field] = matched; continue; }
            var wanted = string.Join(" / ", prefer.OfType<JsonArray>().Select(pattern => string.Join("+", pattern.OfType<JsonNode>().Select(token => token?.GetValue<string>() ?? ""))));
            var available = string.Join("、", options.OfType<JsonNode>().Select(option => option?.GetValue<string>() ?? "").Take(8));
            misses.Add($"{Class((JsonObject)workflow[nodeId]!)}.{field}（期望 {wanted}；本机可用：{available}）");
        }
        if (misses.Count > 0) throw new InvalidDataException("本机 ComfyUI 缺少工作流需要的模型：" + string.Join("；", misses));
        return workflow;
    }

    private async Task<JsonObject> FetchObjectInfoAsync(string serverUrl, CancellationToken token)
    {
        using var response = await SendAsync(serverUrl, "/object_info", HttpMethod.Get, null, token);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"读取 ComfyUI 节点信息失败（HTTP {(int)response.StatusCode}）");
        return JsonNode.Parse(await response.Content.ReadAsStringAsync(token)) as JsonObject ?? new JsonObject();
    }

    internal async Task<DesktopApiResponse> HandleAsync(string method, Uri uri, string bodyText, CancellationToken token)
    {
        try
        {
            var path = uri.AbsolutePath; var store = LoadStore(); var workflows = store["workflows"]!.AsArray(); var config = store["config"]!.AsObject();
            var body = string.IsNullOrWhiteSpace(bodyText) ? new JsonObject() : JsonNode.Parse(bodyText)?.AsObject() ?? new JsonObject();
            if (path == "/api/comfyui/config" && method == "GET") return JsonResponse(200, store);
            if (path == "/api/comfyui/config" && method == "POST") { config["serverUrl"] = NormalizeUrl(body["serverUrl"]?.GetValue<string>() ?? config["serverUrl"]!.GetValue<string>()); if (body["installPath"] is not null) config["installPath"] = body["installPath"]!.GetValue<string>().Trim(); if (body["launchPath"] is not null) config["launchPath"] = body["launchPath"]!.GetValue<string>().Trim(); SaveStore(store); return JsonResponse(200, new { ok = true, config }); }
            if (path == "/api/comfyui/test" && method == "POST") { var url = NormalizeUrl(body["serverUrl"]?.GetValue<string>() ?? config["serverUrl"]!.GetValue<string>()); using var response = await SendAsync(url, "/system_stats", HttpMethod.Get, null, token); if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"ComfyUI 返回 HTTP {(int)response.StatusCode}"); return JsonResponse(200, new { ok = true, serverUrl = url }); }
            if (path == "/api/comfyui/workflows/import" && method == "POST") { var type = body["type"]?.GetValue<string>() ?? ""; if (type.Length == 0) type = DetectWorkflowType(body["workflow"]?.AsObject() ?? throw new InvalidDataException("工作流 JSON 无效")); var templateId = (body["templateId"]?.GetValue<string>() ?? "").Trim(); if (templateId.Length > 0) { var existed = workflows.OfType<JsonObject>().FirstOrDefault(x => x["templateId"]?.GetValue<string>() == templateId); if (existed is not null) return JsonResponse(200, new { ok = true, existed = true, workflow = new { id = existed["id"], name = existed["name"], type = existed["type"] } }); } var workflow = body["workflow"]?.AsObject() ?? throw new InvalidDataException("工作流 JSON 无效"); if (body["hints"] is JsonArray hints && hints.Count > 0) { var infoUrl = NormalizeUrl(body["serverUrl"]?.GetValue<string>() ?? config["serverUrl"]!.GetValue<string>()); workflow = FitWorkflowModels((JsonObject)workflow.DeepClone(), hints, await FetchObjectInfoAsync(infoUrl, token)); } var item = new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["name"] = (body["name"]?.GetValue<string>() ?? "").Trim() is var n && n.Length > 0 ? n : "未命名工作流", ["type"] = type, ["workflow"] = workflow.DeepClone(), ["mapping"] = DetectMapping(type, workflow), ["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }; if (templateId.Length > 0) item["templateId"] = templateId; workflows.Add(item); SaveStore(store); return JsonResponse(200, new { ok = true, workflow = new { id = item["id"], name = item["name"], type } }); }
            if (path == "/api/comfyui/workflows/update" && method == "POST") { var item = workflows.OfType<JsonObject>().FirstOrDefault(x => x["id"]?.GetValue<string>() == body["id"]?.GetValue<string>()); if (item is null) return JsonResponse(404, new { error = "工作流不存在" }); if (body["name"] is not null) item["name"] = body["name"]!.GetValue<string>().Trim(); if (body["workflow"] is JsonObject replacement) { item["workflow"] = replacement.DeepClone(); item["mapping"] = DetectMapping(item["type"]!.GetValue<string>(), replacement); } SaveStore(store); return JsonResponse(200, new { ok = true }); }
            if (path == "/api/comfyui/workflows/delete" && method == "POST") { var item = workflows.FirstOrDefault(x => x?["id"]?.GetValue<string>() == body["id"]?.GetValue<string>()); if (item is null) return JsonResponse(404, new { error = "工作流不存在" }); workflows.Remove(item); SaveStore(store); return JsonResponse(200, new { ok = true }); }
            if (path == "/api/comfyui/workflows/reorder" && method == "POST") { var ids = body["ids"]?.AsArray().Select(x => x?.GetValue<string>() ?? "").ToList() ?? []; var ordered = workflows.OrderBy(x => { var i = ids.IndexOf(x?["id"]?.GetValue<string>() ?? ""); return i < 0 ? int.MaxValue : i; }).Select(x => x!.DeepClone()).ToArray(); workflows.Clear(); foreach (var item in ordered) workflows.Add(item); SaveStore(store); return JsonResponse(200, new { ok = true }); }
            if (path == "/api/comfyui/run" && method == "POST") { var item = workflows.OfType<JsonObject>().FirstOrDefault(x => x["id"]?.GetValue<string>() == body["workflowId"]?.GetValue<string>()); if (item is null) return JsonResponse(404, new { error = "工作流已删除或不存在" }); var url = NormalizeUrl(body["serverUrl"]?.GetValue<string>() ?? config["serverUrl"]!.GetValue<string>()); var prompt = await PreparePrompt(item, body, url, token); using var content = new StringContent(new JsonObject { ["prompt"] = prompt, ["client_id"] = "canvasflow-" + Guid.NewGuid() }.ToJsonString(), Encoding.UTF8, "application/json"); using var response = await SendAsync(url, "/prompt", HttpMethod.Post, content, token); var result = JsonNode.Parse(await response.Content.ReadAsStringAsync(token))?.AsObject() ?? new JsonObject(); var promptId = result["prompt_id"]?.GetValue<string>() ?? ""; if (!response.IsSuccessStatusCode || promptId.Length == 0) throw new InvalidOperationException("提交工作流失败"); var taskId = Guid.NewGuid().ToString(); Tasks[taskId] = new TaskState(promptId, url, item["mapping"]!["outputNodeIds"]!.AsArray().Select(x => x!.GetValue<string>()).ToArray()); return JsonResponse(200, new { ok = true, taskId, promptId }); }
            if (path.StartsWith("/api/comfyui/status/", StringComparison.Ordinal) && method == "GET") { var taskId = path["/api/comfyui/status/".Length..]; if (!Tasks.TryGetValue(taskId, out var task)) return JsonResponse(404, new { error = "任务不存在或已过期" }); if (task.Cancelled) return JsonResponse(200, new { status = "cancelled" }); using var response = await SendAsync(task.ServerUrl, "/history/" + Uri.EscapeDataString(task.PromptId), HttpMethod.Get, null, token); var history = JsonNode.Parse(await response.Content.ReadAsStringAsync(token)) as JsonObject; var entry = history?[task.PromptId] as JsonObject; if (entry is null) return JsonResponse(200, new { status = "running" }); var images = new List<string>(); var videos = new List<string>(); var videoPaths = new List<string>(); foreach (var nodeId in task.OutputNodeIds) foreach (var image in entry["outputs"]?[nodeId]?["images"]?.AsArray() ?? []) { var file = image?["filename"]?.GetValue<string>() ?? ""; if (file.Length == 0 || file.Contains('/') || file.Contains('\\')) continue; var route = "/view?filename=" + Uri.EscapeDataString(file) + "&subfolder=" + Uri.EscapeDataString(image?["subfolder"]?.GetValue<string>() ?? "") + "&type=" + Uri.EscapeDataString(image?["type"]?.GetValue<string>() ?? "output"); using var imageResponse = await SendAsync(task.ServerUrl, route, HttpMethod.Get, null, token); var bytes = await imageResponse.Content.ReadAsByteArrayAsync(token); var ext = file.Contains('.') ? file[(file.LastIndexOf('.') + 1)..] : ""; if (VideoOutputExts.Contains(ext)) { var videoName = SaveVideoFile(bytes, ext.ToLowerInvariant()); videos.Add(videoName); videoPaths.Add(Path.Combine(_root, "download", "videos", videoName)); } else images.Add("data:" + (imageResponse.Content.Headers.ContentType?.MediaType ?? "image/png") + ";base64," + Convert.ToBase64String(bytes)); } if (images.Count == 0 && videos.Count == 0) return JsonResponse(200, new { status = "failed", error = "工作流已完成，但没有找到图片或视频输出" }); Tasks.TryRemove(taskId, out _); return JsonResponse(200, new { status = "succeeded", images, videos, videoPaths }); }
            if (path == "/api/comfyui/cancel" && method == "POST") { var id = body["taskId"]?.GetValue<string>() ?? ""; if (Tasks.TryGetValue(id, out var task)) { task.Cancelled = true; using var content = new StringContent(new JsonObject { ["delete"] = new JsonArray(task.PromptId) }.ToJsonString(), Encoding.UTF8, "application/json"); try { using var _ = await SendAsync(task.ServerUrl, "/queue", HttpMethod.Post, content, token); using var __ = await SendAsync(task.ServerUrl, "/interrupt", HttpMethod.Post, null, token); } catch { } } return JsonResponse(200, new { ok = true }); }
            return JsonResponse(404, new { error = "ComfyUI 路由不存在" });
        }
        catch (Exception error) { return JsonResponse(400, new { error = error.Message }); }
    }
}
