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
    private static readonly HashSet<string> VideoOutputExts = new(StringComparer.OrdinalIgnoreCase) { "mp4", "webm", "mov", "mkv", "gif" };
    // "按文件名读图"的图片入口节点类与字段序（与 JS 版 modules/comfyui-server.js 的
    // IMAGE_ENTRY_CLASS_RE / IMAGE_ENTRY_FIELD_NAMES 逐项对齐，双实现纪律）
    private const string ImageEntryClassPattern = "^(LoadImage|VHS_LoadImage|LoadImageFromPath|GetImageFromPS)$";
    private static readonly string[] ImageEntryFields = { "image", "image_filename", "path" };
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
            // 内置工作流模板已整体下线（2026-11-14）：清扫旧版导入的 templateId=builtin-* 残留（与 JS 版 loadStore 逐项对齐）
            var builtinLeftovers = parsed["workflows"]!.AsArray().OfType<JsonObject>().Where(entry => System.Text.RegularExpressions.Regex.IsMatch(entry["templateId"]?.GetValue<string>() ?? "", "^builtin-")).ToList();
            foreach (var leftover in builtinLeftovers) parsed["workflows"]!.AsArray().Remove(leftover);
            // 映射版本升级（v2 = 尽力而为映射 + PS 桥接类图片入口识别）：旧存档惰性重算并落盘，
            // 用户无需手动"替换"工作流（与 JS 版 loadStore 逐项对齐）
            var upgraded = false;
            foreach (var entry in parsed["workflows"]!.AsArray().OfType<JsonObject>())
            {
                if (entry["workflow"] is JsonObject && entry["mappingVersion"]?.GetValue<int>() != 2)
                {
                    try { entry["mapping"] = DetectMapping((JsonObject)entry["workflow"]!); entry["mappingVersion"] = 2; upgraded = true; }
                    catch { }
                }
            }
            if (upgraded || builtinLeftovers.Count > 0) SaveStore(parsed);
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

    // 映射检测"尽力而为"（2026-11-14 用户要求不限制用户）：除工作流格式错误外零抛错——能识别
    // 多少就映射多少，识别不到的字段不写键，运行时 PreparePrompt 按存在的键打补丁。字段名与
    // modules/comfyui-server.js 的 detectWorkflowMapping 及旧存档 mapping 完全兼容，新增可选
    // positiveField/negativeField（缺省 "text"，仅字段名不是 text 时写出）。
    private static JsonObject DetectMapping(JsonObject workflow)
    {
        var nodes = Nodes(workflow);
        // 图片入口识别（与 JS 版 detectWorkflowMapping 逐项对齐）：LoadImage 之外，PS 桥接
        // (GetImageFromPS)、VHS_LoadImage、LoadImageFromPath 同样以文件名字段喂图。
        static string ImageFieldOf(JsonObject node)
        {
            var inputs = node["inputs"] as JsonObject;
            foreach (var field in new[] { "image", "image_filename", "path" })
                if (inputs?[field] is JsonValue fieldValue && fieldValue.GetValueKind() == JsonValueKind.String) return field;
            return "";
        }
        var images = nodes.Where(pair => System.Text.RegularExpressions.Regex.IsMatch(Class(pair.Node), "^(LoadImage|VHS_LoadImage|LoadImageFromPath|GetImageFromPS)$", System.Text.RegularExpressions.RegexOptions.IgnoreCase) && ImageFieldOf(pair.Node).Length > 0).ToList();
        var samplers = nodes.Where(pair => Class(pair.Node).Contains("KSampler", StringComparison.Ordinal)).ToList();
        var outputs = nodes.Where(pair => new[] { "SaveImage", "PreviewImage", "SaveAnimatedWEBP", "SaveVideo" }.Contains(Class(pair.Node))).ToList();
        var mapping = new JsonObject();
        if (outputs.Count > 0) mapping["outputNodeIds"] = new JsonArray(outputs.Select(pair => JsonValue.Create(pair.Id)).ToArray());
        // 文字节点泛化：有字符串 text/prompt 输入的节点都算（CLIPTextEncode / MiniMaxH3 /
        // SeedVR2 的 prompt 节点等）。负面 = 标题含负面词者；否则仅当"恰好两个同字段文字节点"
        // 时按惯例取第二个（避免把 MiniMaxH3 的 prompt 误当负面清空）。
        static string TextFieldOf(JsonObject node)
        {
            var inputs = node["inputs"] as JsonObject;
            if (inputs?["text"] is JsonValue text && text.GetValueKind() == JsonValueKind.String) return "text";
            if (inputs?["prompt"] is JsonValue prompt && prompt.GetValueKind() == JsonValueKind.String) return "prompt";
            return "";
        }
        var texts = nodes.Where(pair => TextFieldOf(pair.Node).Length > 0).ToList();
        if (texts.Count > 0)
        {
            var negative = texts.FirstOrDefault(pair => Title(pair.Node).Contains("negative") || Title(pair.Node).Contains("负面") || Title(pair.Node).Contains("反向"));
            if (negative.Node is null && texts.Count == 2 && TextFieldOf(texts[0].Node) == TextFieldOf(texts[1].Node)) negative = texts[1];
            var positive = texts.FirstOrDefault(pair => pair.Id != negative.Id && (Title(pair.Node).Contains("positive") || Title(pair.Node).Contains("正面") || Title(pair.Node).Contains("提示词")));
            if (positive.Node is null) positive = texts.FirstOrDefault(pair => pair.Id != negative.Id);
            if (positive.Node is null) positive = texts[0]; // 元组是结构体不能用 ??，与 JS 的 || textNodes[0] 对齐
            mapping["positiveNodeId"] = positive.Id;
            if (TextFieldOf(positive.Node) != "text") mapping["positiveField"] = TextFieldOf(positive.Node);
            if (negative.Node is not null)
            {
                mapping["negativeNodeId"] = negative.Id;
                if (TextFieldOf(negative.Node) != "text") mapping["negativeField"] = TextFieldOf(negative.Node);
            }
        }
        // 采样器/种子：第一个 KSampler（多个不抛错）；无 KSampler 但某节点有数值型 seed 输入时兜底（SeedVR2 类）
        if (samplers.Count > 0)
        {
            var inputs = (JsonObject)samplers[0].Node["inputs"]!;
            mapping["samplerNodeId"] = samplers[0].Id;
            mapping["seedField"] = inputs.ContainsKey("seed") ? "seed" : inputs.ContainsKey("noise_seed") ? "noise_seed" : "";
            mapping["denoiseField"] = inputs.ContainsKey("denoise") ? "denoise" : "";
        }
        else
        {
            var seedNode = nodes.FirstOrDefault(pair => pair.Node["inputs"]?["seed"] is JsonValue seedValue && seedValue.GetValueKind() == JsonValueKind.Number);
            if (seedNode.Node is not null) { mapping["samplerNodeId"] = seedNode.Id; mapping["seedField"] = "seed"; }
        }
        // 时长仍只认 MiniMaxH3 的 length 输入（通用视频工作流不瞎补）
        var h3 = nodes.FirstOrDefault(pair => Class(pair.Node).StartsWith("MiniMaxH3", StringComparison.Ordinal) && (pair.Node["inputs"] as JsonObject)?.ContainsKey("length") == true);
        if (h3.Node is not null) { mapping["durationNodeId"] = h3.Id; mapping["durationField"] = "length"; }
        // 通用参数传导接口（预留）：params = [{param, nodeId, field}, ...]，目前只实现 width/height。
        // 尺寸目标限定在 Latent/Empty/MiniMaxH3 类节点，防止误改 img2img 等工作流里的随机数值节点。
        static bool IsNumber(JsonNode? node) => node is JsonValue value && value.TryGetValue<double>(out var number) && !double.IsNaN(number) && !double.IsInfinity(number);
        static bool IsSizeCandidate(JsonObject node) => Class(node).Contains("Latent", StringComparison.OrdinalIgnoreCase) || Class(node).Contains("MiniMaxH3", StringComparison.OrdinalIgnoreCase) || Class(node).Contains("Empty", StringComparison.OrdinalIgnoreCase);
        var sizeCandidates = nodes.Where(pair => IsSizeCandidate(pair.Node) && IsNumber(pair.Node["inputs"]?["width"]) && IsNumber(pair.Node["inputs"]?["height"])).ToList();
        var sizeNode = sizeCandidates.Count == 1 ? sizeCandidates[0] : sizeCandidates.FirstOrDefault(pair => Class(pair.Node).Contains("Latent", StringComparison.OrdinalIgnoreCase) || Class(pair.Node).Contains("MiniMaxH3", StringComparison.OrdinalIgnoreCase));
        if (sizeNode.Node is not null)
        {
            mapping["params"] = new JsonArray(
                new JsonObject { ["param"] = "width", ["nodeId"] = sizeNode.Id, ["field"] = "width" },
                new JsonObject { ["param"] = "height", ["nodeId"] = sizeNode.Id, ["field"] = "height" });
        }
        // 图片输入：mask = 标题含 mask|蒙版|遮罩 的入口；source = 非 mask 中标题含
        // source|image|原图|输入者优先。imageField/maskField 缺省 "image"（旧存档兼容）。
        if (images.Count > 0)
        {
            var mask = images.FirstOrDefault(pair => Title(pair.Node).Contains("mask") || Title(pair.Node).Contains("蒙版") || Title(pair.Node).Contains("遮罩"));
            var source = images.FirstOrDefault(pair => pair.Id != mask.Id && (Title(pair.Node).Contains("source") || Title(pair.Node).Contains("image") || Title(pair.Node).Contains("原图") || Title(pair.Node).Contains("输入")));
            if (source.Node is null) source = images.FirstOrDefault(pair => pair.Id != mask.Id);
            if (source.Node is null) source = images[0];
            mapping["imageNodeId"] = source.Id;
            var sourceField = ImageFieldOf(source.Node);
            if (sourceField != "image") mapping["imageField"] = sourceField;
            if (mask.Node is not null)
            {
                mapping["maskNodeId"] = mask.Id;
                var maskField = ImageFieldOf(mask.Node);
                if (maskField != "image") mapping["maskField"] = maskField;
            }
        }
        return mapping;
    }

    // 虚拟输出注入（与 JS 版 pickVirtualOutputNode 逐项对齐）：工作流没有 Save* 输出节点时
    // （如 PS 桥接的 SendImageToPS），status 收不到结果——在执行的临时副本上注入 SaveImage
    // 接到结果节点，存储原件不动。注入点：①未被引用的"终端"节点沿 images/image 输入回溯一个；
    // ②无带图链的终端则取未被引用、自身消费图链的节点；③再退取末端最后一个。
    private const string VirtualOutputId = "canvasflow_output";
    private static string? PickVirtualOutputNode(JsonObject workflow)
    {
        var nodes = workflow.Where(pair => pair.Value is JsonObject node && node["class_type"] is not null).Select(pair => (Id: pair.Key, Node: (JsonObject)pair.Value!)).ToList();
        var referenced = new HashSet<string>();
        foreach (var pair in nodes)
            foreach (var input in pair.Node["inputs"]!.AsObject())
                if (input.Value is JsonArray link && link.Count > 0 && link[0] is JsonValue idValue && idValue.GetValueKind() == JsonValueKind.String)
                    referenced.Add(idValue.GetValue<string>()!);
        var terminals = nodes.Where(pair => !referenced.Contains(pair.Id)).ToList();
        // 从最后一个终端倒序找（与 JS 版一致：API 导出的输出端在末尾，避免残缺分支抢先命中）
        foreach (var pair in terminals.AsEnumerable().Reverse())
        {
            if (System.Text.RegularExpressions.Regex.IsMatch(Class(pair.Node), "^(Save|Preview)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return null;
            foreach (var input in pair.Node["inputs"]!.AsObject())
                if (input.Value is JsonArray link && link.Count > 0 && link[0] is JsonValue && System.Text.RegularExpressions.Regex.IsMatch(input.Key, "image", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    return link[0]!.GetValue<string>();
        }
        var endNodes = terminals.Where(pair => !System.Text.RegularExpressions.Regex.IsMatch(Class(pair.Node), "^(Save|Preview|Send)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)).ToList();
        if (endNodes.Count == 0) return null;
        var consumer = endNodes.FirstOrDefault(pair => pair.Node["inputs"]!.AsObject().Any(input => input.Value is JsonArray));
        return consumer.Node is not null ? consumer.Id : endNodes[endNodes.Count - 1].Id;
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
        // positiveField/negativeField 缺省 "text"（旧存档 mapping 无此键）；与 JS 版 preparePrompt 逐项对齐
        Set("positiveNodeId", map["positiveField"]?.GetValue<string>() ?? "text", body["prompt"]);
        Set("negativeNodeId", map["negativeField"]?.GetValue<string>() ?? "text", body["negativePrompt"]);
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
        // 图片输入（2026-11-14 全参数面板扩展，与 JS 版 preparePrompt 逐项对齐）：上游第一张图
        // 喂给**全部**图片入口节点，不再只喂映射选中的那一个；蒙版入口排除（仍由 maskData 单独喂）。
        var maskNodeId = map["maskNodeId"]?.GetValue<string>() ?? "";
        var imageData = body["imageData"]?.GetValue<string>();
        if (!string.IsNullOrEmpty(imageData))
        {
            var uploadedName = await UploadAsync(serverUrl, imageData, "source", token);
            foreach (var pair in workflow)
            {
                if (pair.Key == maskNodeId || pair.Value is not JsonObject entryNode || !System.Text.RegularExpressions.Regex.IsMatch(entryNode["class_type"]?.GetValue<string>() ?? "", ImageEntryClassPattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase)) continue;
                if (entryNode["inputs"] is not JsonObject entryInputs) continue;
                var entryField = ImageEntryFields.FirstOrDefault(field => entryInputs[field] is JsonValue fieldValue && fieldValue.GetValueKind() == JsonValueKind.String);
                if (entryField is not null) entryInputs[entryField] = uploadedName;
            }
        }
        if (maskNodeId.Length > 0 && workflow[maskNodeId]?["inputs"] is JsonObject maskInputs) maskInputs[map["maskField"]?.GetValue<string>() ?? "image"] = await UploadAsync(serverUrl, body["maskData"]?.GetValue<string>(), "mask", token);
        // 全参数面板回传（2026-11-14）：mapping 补丁之后打 paramValues（后者优先），只覆盖已编辑的字段。
        // 键形状 { [nodeId]: { [field]: value } }；与 JS 版 preparePrompt 逐项对齐（双实现纪律）。
        if (body["paramValues"] is JsonObject paramValues)
        {
            foreach (var pair in paramValues)
            {
                if (workflow[pair.Key]?["inputs"] is not JsonObject targetInputs || pair.Value is not JsonObject fields) continue;
                foreach (var fieldPair in fields)
                {
                    if (fieldPair.Value is null || fieldPair.Value is JsonValue nullValue && nullValue.GetValueKind() == JsonValueKind.Null) continue;
                    targetInputs[fieldPair.Key] = fieldPair.Value.DeepClone();
                }
            }
        }
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

    // 与 JS 版 classifyUserWorkflow 逐项对齐：UI 格式（nodes 数组）与 API 格式（数字键 + class_type，兼容 extra_data/output 附加键）。
    private static string ClassifyWorkflow(JsonNode? parsed)
    {
        if (parsed is not JsonObject obj) return "unknown";
        if (obj["nodes"] is JsonArray) return "ui";
        foreach (var pair in obj)
            if (pair.Value is JsonObject node && node["class_type"] is JsonNode classType && classType.GetValueKind() == JsonValueKind.String) return "api";
        return "unknown";
    }

    // 自动列出本机 ComfyUI 已保存的工作流（与 JS 版 fetchUserWorkflows 逐项对齐，双实现纪律）。
    // 端点形态 2026-11-14 实测：列表 GET /v2/userdata?path=workflows（path 相对用户根目录）；
    // 取文件 GET /userdata/<Uri.EscapeDataString(path)> —— 斜杠编码为 %2F 才能命中 /userdata/{file} 单段路由。
    private const int UserWorkflowMaxFiles = 40;

    private async Task<JsonArray> FetchUserWorkflowsAsync(string serverUrl, CancellationToken token)
    {
        using var response = await SendAsync(serverUrl, "/v2/userdata?path=" + Uri.EscapeDataString("workflows"), HttpMethod.Get, null, token);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"读取 ComfyUI 工作流列表失败（HTTP {(int)response.StatusCode}）");
        var entries = JsonNode.Parse(await response.Content.ReadAsStringAsync(token)) as JsonArray ?? [];
        var files = entries.OfType<JsonObject>()
            .Where(entry => entry["type"]?.GetValue<string>() == "file" && entry["path"]?.GetValue<string>() is string workflowPath && workflowPath.StartsWith("workflows/", StringComparison.Ordinal) && workflowPath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(entry => entry["modified"]?.GetValue<double>() ?? 0)
            .Take(UserWorkflowMaxFiles)
            .ToList();
        var items = await Task.WhenAll(files.Select(entry => FetchUserWorkflowItemAsync(serverUrl, entry, token)));
        return new JsonArray(items);
    }

    private async Task<JsonObject> FetchUserWorkflowItemAsync(string serverUrl, JsonObject entry, CancellationToken token)
    {
        var path = entry["path"]!.GetValue<string>();
        var name = path.Split('/').Last();
        if (name.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) name = name[..^".json".Length];
        var item = new JsonObject { ["path"] = path, ["name"] = name, ["size"] = entry["size"]?.GetValue<double>() ?? 0, ["modified"] = entry["modified"]?.GetValue<double>() ?? 0 };
        try
        {
            using var response = await SendAsync(serverUrl, "/userdata/" + Uri.EscapeDataString(path), HttpMethod.Get, null, token);
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"HTTP {(int)response.StatusCode}");
            JsonNode? parsed;
            try { parsed = JsonNode.Parse(await response.Content.ReadAsStringAsync(token)); }
            catch (JsonException) { throw new InvalidDataException("文件不是合法 JSON"); }
            var format = ClassifyWorkflow(parsed);
            item["format"] = format; item["importable"] = format == "api";
            if (format == "api" && parsed is not null) item["workflow"] = parsed.DeepClone();
        }
        catch (Exception error) { item["format"] = "unknown"; item["importable"] = false; item["error"] = error.Message; }
        return item;
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
            if (path == "/api/comfyui/workflows/user-list" && method == "POST") { var url = NormalizeUrl(body["serverUrl"]?.GetValue<string>() ?? config["serverUrl"]!.GetValue<string>()); var items = await FetchUserWorkflowsAsync(url, token); return JsonResponse(200, new { ok = true, serverUrl = url, items }); }
            // 全参数面板：按类取 object_info 子集（combo 选项/数值范围/多行标记）；与 JS 版 fetchObjectInfoSubset 逐项对齐
            if (path == "/api/comfyui/object-info" && method == "POST")
            {
                var url = NormalizeUrl(body["serverUrl"]?.GetValue<string>() ?? config["serverUrl"]!.GetValue<string>());
                var classes = (body["classes"] as JsonArray)?.OfType<JsonNode>().Select(x => x?.GetValue<string>() ?? "").Where(x => x.Length > 0).Distinct().Take(24).ToArray() ?? Array.Empty<string>();
                var info = new JsonObject();
                if (classes.Length > 0)
                {
                    var singleOk = true;
                    foreach (var cls in classes)
                    {
                        try
                        {
                            using var response = await SendAsync(url, "/object_info/" + Uri.EscapeDataString(cls), HttpMethod.Get, null, token);
                            if (!response.IsSuccessStatusCode) { singleOk = false; break; }
                            var parsed = JsonNode.Parse(await response.Content.ReadAsStringAsync(token)) as JsonObject;
                            var spec = parsed?[cls] ?? (JsonNode?)parsed;
                            if (spec is not JsonObject specObject) { singleOk = false; break; }
                            info[cls] = specObject.DeepClone();
                        }
                        catch { singleOk = false; break; }
                    }
                    if (!singleOk)
                    {
                        info.Clear();
                        var full = await FetchObjectInfoAsync(url, token);
                        foreach (var cls in classes) if (full[cls] is JsonObject fullSpec) info[cls] = fullSpec.DeepClone();
                    }
                }
                return JsonResponse(200, new { ok = true, serverUrl = url, info });
            }
            if (path == "/api/comfyui/workflows/import" && method == "POST") { var type = body["type"]?.GetValue<string>() ?? ""; if (type.Length == 0) type = DetectWorkflowType(body["workflow"]?.AsObject() ?? throw new InvalidDataException("工作流 JSON 无效")); var templateId = (body["templateId"]?.GetValue<string>() ?? "").Trim(); if (templateId.Length > 0) { var existed = workflows.OfType<JsonObject>().FirstOrDefault(x => x["templateId"]?.GetValue<string>() == templateId); if (existed is not null) return JsonResponse(200, new { ok = true, existed = true, workflow = new { id = existed["id"], name = existed["name"], type = existed["type"] } }); } var workflow = body["workflow"]?.AsObject() ?? throw new InvalidDataException("工作流 JSON 无效"); if (body["hints"] is JsonArray hints && hints.Count > 0) { var infoUrl = NormalizeUrl(body["serverUrl"]?.GetValue<string>() ?? config["serverUrl"]!.GetValue<string>()); workflow = FitWorkflowModels((JsonObject)workflow.DeepClone(), hints, await FetchObjectInfoAsync(infoUrl, token)); } var item = new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["name"] = (body["name"]?.GetValue<string>() ?? "").Trim() is var n && n.Length > 0 ? n : "未命名工作流", ["type"] = type, ["workflow"] = workflow.DeepClone(), ["mapping"] = DetectMapping(workflow), ["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }; if (templateId.Length > 0) item["templateId"] = templateId; workflows.Add(item); SaveStore(store); return JsonResponse(200, new { ok = true, workflow = new { id = item["id"], name = item["name"], type } }); }
            if (path == "/api/comfyui/workflows/update" && method == "POST") { var item = workflows.OfType<JsonObject>().FirstOrDefault(x => x["id"]?.GetValue<string>() == body["id"]?.GetValue<string>()); if (item is null) return JsonResponse(404, new { error = "工作流不存在" }); if (body["name"] is not null) item["name"] = body["name"]!.GetValue<string>().Trim(); if (body["workflow"] is JsonObject replacement) { item["workflow"] = replacement.DeepClone(); item["mapping"] = DetectMapping(replacement); } SaveStore(store); return JsonResponse(200, new { ok = true }); }
            if (path == "/api/comfyui/workflows/delete" && method == "POST") { var item = workflows.FirstOrDefault(x => x?["id"]?.GetValue<string>() == body["id"]?.GetValue<string>()); if (item is null) return JsonResponse(404, new { error = "工作流不存在" }); workflows.Remove(item); SaveStore(store); return JsonResponse(200, new { ok = true }); }
            if (path == "/api/comfyui/workflows/reorder" && method == "POST") { var ids = body["ids"]?.AsArray().Select(x => x?.GetValue<string>() ?? "").ToList() ?? []; var ordered = workflows.OrderBy(x => { var i = ids.IndexOf(x?["id"]?.GetValue<string>() ?? ""); return i < 0 ? int.MaxValue : i; }).Select(x => x!.DeepClone()).ToArray(); workflows.Clear(); foreach (var item in ordered) workflows.Add(item); SaveStore(store); return JsonResponse(200, new { ok = true }); }
            if (path == "/api/comfyui/run" && method == "POST") { var item = workflows.OfType<JsonObject>().FirstOrDefault(x => x["id"]?.GetValue<string>() == body["workflowId"]?.GetValue<string>()); if (item is null) return JsonResponse(404, new { error = "工作流已删除或不存在" }); var url = NormalizeUrl(body["serverUrl"]?.GetValue<string>() ?? config["serverUrl"]!.GetValue<string>()); var prompt = await PreparePrompt(item, body, url, token);
// 无正规输出节点的工作流（PS 桥接等）：注入 SaveImage 才能拿回结果（与 JS 版 run 路由逐项对齐）
var outputIds = (item["mapping"]?["outputNodeIds"] as JsonArray)?.OfType<JsonNode>().Select(x => x!.GetValue<string>()).ToArray() ?? Array.Empty<string>();
if (outputIds.Length == 0) { var virtualTarget = PickVirtualOutputNode(prompt); if (virtualTarget is not null) { prompt[VirtualOutputId] = new JsonObject { ["class_type"] = "SaveImage", ["inputs"] = new JsonObject { ["images"] = new JsonArray(virtualTarget, 0), ["filename_prefix"] = "canvasflow" }, ["_meta"] = new JsonObject { ["title"] = "CanvasFlow Output" } }; outputIds = new[] { VirtualOutputId }; } }
using var content = new StringContent(new JsonObject { ["prompt"] = prompt, ["client_id"] = "canvasflow-" + Guid.NewGuid() }.ToJsonString(), Encoding.UTF8, "application/json"); using var response = await SendAsync(url, "/prompt", HttpMethod.Post, content, token); var result = JsonNode.Parse(await response.Content.ReadAsStringAsync(token))?.AsObject() ?? new JsonObject(); var promptId = result["prompt_id"]?.GetValue<string>() ?? ""; if (!response.IsSuccessStatusCode || promptId.Length == 0) throw new InvalidOperationException("提交工作流失败"); var taskId = Guid.NewGuid().ToString(); Tasks[taskId] = new TaskState(promptId, url, outputIds); return JsonResponse(200, new { ok = true, taskId, promptId }); }
            if (path.StartsWith("/api/comfyui/status/", StringComparison.Ordinal) && method == "GET") { var taskId = path["/api/comfyui/status/".Length..]; if (!Tasks.TryGetValue(taskId, out var task)) return JsonResponse(404, new { error = "任务不存在或已过期" }); if (task.Cancelled) return JsonResponse(200, new { status = "cancelled" }); using var response = await SendAsync(task.ServerUrl, "/history/" + Uri.EscapeDataString(task.PromptId), HttpMethod.Get, null, token); var history = JsonNode.Parse(await response.Content.ReadAsStringAsync(token)) as JsonObject; var entry = history?[task.PromptId] as JsonObject; if (entry is null) return JsonResponse(200, new { status = "running" });
// 与 comfyui-server.js 同步：历史条目存在时先看执行错误/中断，别把真实失败原因吞成“没有输出”（2026-11-14 OOM 实踩）
var statusMessages = entry["status"]?["messages"] as JsonArray ?? new JsonArray();
var executionMessage = statusMessages.OfType<JsonArray>().FirstOrDefault(m => m.Count > 0 && (m[0]?.GetValue<string>() == "execution_error" || m[0]?.GetValue<string>() == "execution_interrupted"));
if (executionMessage is not null) { var kind = executionMessage[0]!.GetValue<string>(); var detail = executionMessage.Count > 1 ? executionMessage[1]?["exception_message"]?.GetValue<string>() ?? executionMessage[1]?["node_type"]?.GetValue<string>() : null; Tasks.TryRemove(taskId, out _); return JsonResponse(200, new { status = "failed", error = kind == "execution_interrupted" ? "ComfyUI 任务被中断" : (detail ?? "ComfyUI 执行失败") }); } var images = new List<string>(); var videos = new List<string>(); var videoPaths = new List<string>();
// 导入时没识别出输出节点的工作流：兜底遍历全部节点输出；VHS_VideoCombine 的输出键是 gifs，与 images 两键都收（与 JS 版 historyOutputs 逐项对齐）
var outputNodeIds = task.OutputNodeIds.Length > 0 ? task.OutputNodeIds : (entry["outputs"] as JsonObject)?.Select(pair => pair.Key).ToArray() ?? Array.Empty<string>();
foreach (var nodeId in outputNodeIds) foreach (var image in (entry["outputs"]?[nodeId]?["images"]?.AsArray() ?? []).Concat(entry["outputs"]?[nodeId]?["gifs"]?.AsArray() ?? [])) { var file = image?["filename"]?.GetValue<string>() ?? ""; if (file.Length == 0 || file.Contains('/') || file.Contains('\\')) continue; var route = "/view?filename=" + Uri.EscapeDataString(file) + "&subfolder=" + Uri.EscapeDataString(image?["subfolder"]?.GetValue<string>() ?? "") + "&type=" + Uri.EscapeDataString(image?["type"]?.GetValue<string>() ?? "output"); using var imageResponse = await SendAsync(task.ServerUrl, route, HttpMethod.Get, null, token); var bytes = await imageResponse.Content.ReadAsByteArrayAsync(token); var ext = file.Contains('.') ? file[(file.LastIndexOf('.') + 1)..] : ""; if (VideoOutputExts.Contains(ext)) { var videoName = SaveVideoFile(bytes, ext.ToLowerInvariant()); videos.Add(videoName); videoPaths.Add(Path.Combine(_root, "download", "videos", videoName)); } else images.Add("data:" + (imageResponse.Content.Headers.ContentType?.MediaType ?? "image/png") + ";base64," + Convert.ToBase64String(bytes)); } if (images.Count == 0 && videos.Count == 0) return JsonResponse(200, new { status = "failed", error = "工作流已完成，但没有找到图片或视频输出" }); Tasks.TryRemove(taskId, out _); return JsonResponse(200, new { status = "succeeded", images, videos, videoPaths }); }
            if (path == "/api/comfyui/cancel" && method == "POST") { var id = body["taskId"]?.GetValue<string>() ?? ""; if (Tasks.TryGetValue(id, out var task)) { task.Cancelled = true; using var content = new StringContent(new JsonObject { ["delete"] = new JsonArray(task.PromptId) }.ToJsonString(), Encoding.UTF8, "application/json"); try { using var _ = await SendAsync(task.ServerUrl, "/queue", HttpMethod.Post, content, token); using var __ = await SendAsync(task.ServerUrl, "/interrupt", HttpMethod.Post, null, token); } catch { } } return JsonResponse(200, new { ok = true }); }
            return JsonResponse(404, new { error = "ComfyUI 路由不存在" });
        }
        catch (Exception error) { return JsonResponse(400, new { error = error.Message }); }
    }
}
