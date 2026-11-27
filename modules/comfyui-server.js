const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VIDEO_OUTPUT_EXTS = new Set(["mp4", "webm", "mov", "mkv", "gif"]);
const tasks = new Map();

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
  // 返回 true 供 handle 的 `return json(...)` 分支表达"已处理"：此前无返回值导致 handle 对
  // /api/comfyui/config 等分支写完响应后仍返回 undefined，requestHandler 继续落入静态回退分支
  // 二次 writeHead → ERR_HTTP_HEADERS_SENT 未捕获 → 整个服务进程崩溃（页面加载即触发）。
  return true;
}

async function readJson(req, limit = 180 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("请求内容超过180MB限制");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeServerUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("ComfyUI 服务地址无效"); }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error("ComfyUI 地址只支持明确的 HTTP/HTTPS URL");
  return parsed.toString().replace(/\/$/, "");
}

function workflowNodes(workflow) {
  if (!workflow || Array.isArray(workflow) || typeof workflow !== "object") throw new Error("请选择 ComfyUI 导出的 API 格式 JSON");
  const nodes = Object.entries(workflow).map(([id, value]) => ({ id, ...(value || {}) })).filter(node => node.class_type && node.inputs && typeof node.inputs === "object");
  if (!nodes.length) throw new Error("工作流中没有可执行的 API 节点");
  return nodes;
}

function titleOf(node) { return String(node?._meta?.title || node?.title || "").toLowerCase(); }
function firstField(node, names) { return names.find(name => Object.prototype.hasOwnProperty.call(node.inputs || {}, name)) || ""; }

// "按文件名读图"的图片入口节点类（与 C# 侧 ComfyUiApi.cs 的入口正则逐项对齐）：
// LoadImage 之外，PS 桥接(GetImageFromPS)、VHS_LoadImage、LoadImageFromPath 同样以文件名字段喂图
const IMAGE_ENTRY_CLASS_RE = /^(LoadImage|VHS_LoadImage|LoadImageFromPath|GetImageFromPS)$/i;
const IMAGE_ENTRY_FIELD_NAMES = ["image", "image_filename", "path"];

// 映射检测"尽力而为"（2026-11-14 用户要求不限制用户）：除 workflowNodes 的两条格式错误外
// 零抛错——能识别多少就映射多少，识别不到的字段不写键，运行时 preparePrompt 按存在的键打
// 补丁，工作流其余部分原样执行。字段名与旧版 mapping 完全兼容（旧存档已导入工作流继续可用），
// 新增可选 positiveField/negativeField（缺省 "text"，仅字段名不是 text 时写出）。
function detectWorkflowMapping(workflow) {
  const nodes = workflowNodes(workflow);
  const samplerNodes = nodes.filter(node => /KSampler/.test(node.class_type));
  const outputNodes = nodes.filter(node => /^(SaveImage|PreviewImage|SaveAnimatedWEBP|SaveVideo)$/.test(node.class_type));
  const mapping = {};
  if (outputNodes.length) mapping.outputNodeIds = outputNodes.map(node => node.id);
  // 文字节点泛化：有字符串 text/prompt 输入的节点都算（CLIPTextEncode / MiniMaxH3 /
  // SeedVR2 的 prompt 节点等）。负面 = 标题含负面词者；否则仅当"恰好两个同字段文字节点"
  // 时按惯例取第二个（避免把 MiniMaxH3 的 prompt 误当负面清空）。
  const textFieldOf = node => (typeof node.inputs?.text === "string" ? "text" : typeof node.inputs?.prompt === "string" ? "prompt" : "");
  const textNodes = nodes.filter(node => textFieldOf(node));
  if (textNodes.length) {
    const negative = textNodes.find(node => /negative|负面|反向/.test(titleOf(node)))
      || (textNodes.length === 2 && textFieldOf(textNodes[0]) === textFieldOf(textNodes[1]) ? textNodes[1] : null);
    const positive = textNodes.find(node => node !== negative && /positive|正面|提示词/.test(titleOf(node))) || textNodes.find(node => node !== negative) || textNodes[0];
    mapping.positiveNodeId = positive.id;
    const positiveField = textFieldOf(positive);
    if (positiveField !== "text") mapping.positiveField = positiveField;
    if (negative) {
      mapping.negativeNodeId = negative.id;
      const negativeField = textFieldOf(negative);
      if (negativeField !== "text") mapping.negativeField = negativeField;
    }
  }
  // 采样器/种子：第一个 KSampler；无 KSampler 但某节点有数值型 seed 输入时兜底（SeedVR2 类）
  if (samplerNodes.length) {
    mapping.samplerNodeId = samplerNodes[0].id;
    mapping.seedField = firstField(samplerNodes[0], ["seed", "noise_seed"]);
    mapping.denoiseField = firstField(samplerNodes[0], ["denoise"]);
  } else {
    const seedNode = nodes.find(node => typeof node.inputs?.seed === "number");
    if (seedNode) { mapping.samplerNodeId = seedNode.id; mapping.seedField = "seed"; }
  }
  // 时长仍只认 MiniMaxH3 的 length 输入（通用视频工作流不瞎补）
  const h3Node = nodes.find(node => /^MiniMaxH3/.test(node.class_type) && Object.prototype.hasOwnProperty.call(node.inputs || {}, "length"));
  if (h3Node) {
    mapping.durationNodeId = h3Node.id;
    mapping.durationField = "length";
  }
  // 通用参数传导接口（预留）：params = [{ param, nodeId, field }, ...]，目前只实现 width/height。
  // 尺寸目标限定在 Latent/Empty/MiniMaxH3 类节点，防止误改 img2img 等工作流里的随机数值节点。
  const isNumber = value => typeof value === "number" && Number.isFinite(value);
  const sizeCandidates = nodes.filter(node => /Latent|MiniMaxH3|Empty/i.test(node.class_type) && isNumber(node.inputs?.width) && isNumber(node.inputs?.height));
  const sizeNode = sizeCandidates.length === 1 ? sizeCandidates[0]
    : sizeCandidates.find(node => /Latent|MiniMaxH3/i.test(node.class_type)) || null;
  if (sizeNode) {
    mapping.params = [
      { param: "width", nodeId: sizeNode.id, field: "width" },
      { param: "height", nodeId: sizeNode.id, field: "height" },
    ];
  }
  // 图片输入：识别"按文件名读图"的入口节点——LoadImage 之外，PS 桥接(GetImageFromPS)、
  // VHS_LoadImage、LoadImageFromPath 同样以文件名字段喂图（上传后写回该字段）。
  // mask = 标题含 mask|蒙版|遮罩 的入口；source = 非 mask 中标题含 source|image|原图|输入者优先。
  // 找不到就不写字段（局部重绘需给蒙版节点设标题）。imageField/maskField 缺省 "image"。
  const imageFieldOf = node => IMAGE_ENTRY_FIELD_NAMES.find(name => typeof node.inputs?.[name] === "string") || "";
  const imageNodes = nodes.filter(node => IMAGE_ENTRY_CLASS_RE.test(node.class_type) && imageFieldOf(node));
  if (imageNodes.length) {
    const mask = imageNodes.find(node => /mask|蒙版|遮罩/.test(titleOf(node)));
    const source = imageNodes.find(node => node !== mask && /source|image|原图|输入/.test(titleOf(node))) || imageNodes.find(node => node !== mask) || imageNodes[0];
    mapping.imageNodeId = source.id;
    const imageField = imageFieldOf(source);
    if (imageField !== "image") mapping.imageField = imageField;
    if (mask) {
      mapping.maskNodeId = mask.id;
      const maskField = imageFieldOf(mask);
      if (maskField !== "image") mapping.maskField = maskField;
    }
  }
  return mapping;
}

// 动画时长（秒）→ MiniMaxH3 length 帧数：24fps，向上取整到模型的 17k+5 网格，
// 公式取自用户工作流里的 ComfyMathExpression；训练区间约 124-362 帧（5-15 秒）。
function videoFrameLength(seconds) {
  const parsed = Number(seconds);
  const value = Math.max(2, Math.min(15, Number.isFinite(parsed) ? parsed : 5));
  let frames = Math.max(5, Math.round(value * 24));
  frames += (5 - (frames % 17)) % 17;
  return Math.min(frames, 362);
}

// SD 尺寸档：与 AI 绘图节点的分辨率/比例语义对齐（分辨率 = 长边像素），结果 32 对齐
// （同时满足 Klein latent 的 16 步进与 H3 的 32 步进）。
const SD_RESOLUTIONS = { "0.5K": 512, "1K": 1024, "2K": 2048 };
const SD_RATIOS = { "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9, "9:16": 9 / 16, "3:2": 1.5, "2:3": 2 / 3 };
function sdImageSize(resolution, ratio) {
  const base = SD_RESOLUTIONS[resolution] || SD_RESOLUTIONS["1K"];
  const ar = SD_RATIOS[ratio] || 1;
  const snap = value => Math.max(256, Math.min(4096, Math.round(value / 32) * 32));
  return ar >= 1 ? { width: snap(base), height: snap(base / ar) } : { width: snap(base * ar), height: snap(base) };
}

// 按内容自动识别工作流类型（导入时不再让用户手选）：视频按 SaveVideo 区分首帧图；
// 抠图按特征模型类名；局部重绘按蒙版 LoadImage；放大按 Upscale 类；图生图按 LoadImage。
function detectWorkflowType(workflow) {
  const nodes = workflowNodes(workflow);
  const hasClass = regex => nodes.some(node => regex.test(node.class_type));
  const hasImageInput = nodes.some(node => node.class_type === "LoadImage");
  const hasMaskLoadImage = nodes.some(node => node.class_type === "LoadImage" && /mask|蒙版|遮罩/.test(titleOf(node)));
  if (hasClass(/^SaveVideo$/)) return hasImageInput ? "video-i2v" : "video-t2v";
  if (hasImageInput && hasClass(/SDMatte|RMBG|BiRefNet|SegmentAnything/)) return "matting";
  if (hasMaskLoadImage) return "inpaint";
  if (hasImageInput && hasClass(/Upscale|ScaleBy|ScaleToTotalPixels/)) return "upscale";
  if (hasImageInput) return "img2img";
  return "txt2img";
}

function storePath(dataRoot) { return path.join(dataRoot, "data", "comfyui.json"); }
function loadStore(dataRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(dataRoot), "utf8").replace(/^\uFEFF/, ""));
    const store = { config: { serverUrl: "http://127.0.0.1:8188", installPath: "", launchPath: "", ...(parsed.config || {}) }, workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [] };
    // 内置工作流模板已整体下线（2026-11-14）：清扫旧版导入的 templateId=builtin-* 残留条目，
    // 它们是"一键模板"时代的半成品（放大/局部重绘等需要连线/蒙版，孤立运行不了）。
    const builtinLeftovers = store.workflows.filter(entry => /^builtin-/.test(String(entry?.templateId || "")));
    if (builtinLeftovers.length) {
      store.workflows = store.workflows.filter(entry => !/^builtin-/.test(String(entry?.templateId || "")));
      console.log("[本地SD] 清理已下线的内置工作流模板残留：", builtinLeftovers.map(entry => entry.name).join("、"));
    }
    // 映射版本升级（v2 = 尽力而为映射 + PS 桥接类图片入口识别）：旧存档惰性重算，
    // 用户无需手动"替换"工作流；升级即落盘，后续请求直接命中 v2 不再重算。
    let upgraded = false;
    for (const entry of store.workflows) {
      if (entry?.workflow && entry.mappingVersion !== 2) {
        try { entry.mapping = detectWorkflowMapping(entry.workflow); entry.mappingVersion = 2; upgraded = true; }
        catch { /* 工作流损坏则保留旧映射 */ }
      }
    }
    if (upgraded || builtinLeftovers.length) {
      try { saveStore(dataRoot, store); }
      catch (error) { console.warn(`[本地SD] 工作流升级结果保存失败，保留已读取的工作流：${error.code || error.name}`); }
    }
    return store;
  } catch { return { config: { serverUrl: "http://127.0.0.1:8188", installPath: "", launchPath: "" }, workflows: [] }; }
}
function saveStore(dataRoot, store) {
  const file = storePath(dataRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temp, file);
}

async function comfyFetch(serverUrl, pathname, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(normalizeServerUrl(serverUrl) + pathname, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("连接 ComfyUI 超时");
    throw new Error(`无法连接 ComfyUI：${error.message}`);
  } finally { clearTimeout(timer); }
}

function dataUrlParts(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("输入图片格式无效");
  const ext = match[1].includes("jpeg") ? "jpg" : match[1].split("/")[1].replace(/[^a-z0-9]/gi, "") || "png";
  return { mime: match[1], bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64"), ext };
}

async function uploadImage(serverUrl, dataUrl, prefix) {
  const data = dataUrlParts(dataUrl);
  const form = new FormData();
  const name = `canvasflow_${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${data.ext}`;
  form.append("image", new Blob([data.bytes], { type: data.mime }), name);
  form.append("overwrite", "false");
  const response = await comfyFetch(serverUrl, "/upload/image", { method: "POST", body: form }, 60000);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.name) throw new Error(result.error?.message || result.error || `上传图片失败（HTTP ${response.status}）`);
  return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

async function fetchObjectInfo(serverUrl) {
  const response = await comfyFetch(serverUrl, "/object_info", {}, 30000);
  if (!response.ok) throw new Error(`读取 ComfyUI 节点信息失败（HTTP ${response.status}）`);
  return response.json();
}

// 全参数面板用：只取工作流涉及节点类的 object_info（combo 选项/数值范围/多行标记）。
// 优先逐类取 /object_info/{class}（payload 小）；任一失败回退整包一次再摘取。
// 与 ComfyUiApi.cs 的 object-info 路由逐项对齐（双实现纪律）。导出供测试。
async function fetchObjectInfoSubset(serverUrl, classes) {
  const wanted = [...new Set((Array.isArray(classes) ? classes : []).map(cls => String(cls)).filter(Boolean))].slice(0, 24);
  if (!wanted.length) return {};
  const settled = await Promise.allSettled(wanted.map(async cls => {
    const response = await comfyFetch(serverUrl, "/object_info/" + encodeURIComponent(cls), {}, 15000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await response.json();
    const spec = parsed?.[cls] ?? parsed;
    if (!spec || typeof spec !== "object") throw new Error(`ComfyUI 没有返回 ${cls} 的节点定义`);
    return [cls, spec];
  }));
  if (settled.some(result => result.status === "rejected")) {
    const full = await fetchObjectInfo(serverUrl);
    const info = {};
    for (const cls of wanted) if (full?.[cls]) info[cls] = full[cls];
    return info;
  }
  return Object.fromEntries(settled.map(result => result.value));
}

// ComfyUI 已保存工作流的格式分类：UI 格式（nodes 数组，映射检测不认）与 API 格式（数字键 + class_type）。
// API 导出文件顶层还可能带 extra_data/output 等附加键，不能简单按键数判断。
function classifyUserWorkflow(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "unknown";
  if (Array.isArray(parsed.nodes)) return "ui";
  const hasApiNode = Object.values(parsed).some(entry => entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.class_type === "string");
  return hasApiNode ? "api" : "unknown";
}

// 自动列出本机 ComfyUI 已保存的工作流（设置→本地SD→工作流库「从 ComfyUI 获取」）。
// 端点形态 2026-11-14 在 ComfyUI(app/user_manager.py) 实测确定：
//   列表 GET /v2/userdata?path=workflows（全子树遍历，path 相对用户根目录，type/size/modified）
//   取文件 GET /userdata/<encodeURIComponent(path)> —— encodeURIComponent 把斜杠编码成 %2F
//   才能命中 /userdata/{file} 单段路由（带斜杠的原始路径直接 404）。
// 仅 API 格式条目携带 workflow 内容供前端直接走既有 import 路由；单文件失败不阻断整批。
const USER_WORKFLOW_MAX_FILES = 40;

function userWorkflowEntryMeta(entry) {
  const path = String(entry.path || "");
  const basename = path.split("/").pop() || path;
  return { path, name: basename.replace(/\.json$/i, ""), size: Number(entry.size || 0), modified: Number(entry.modified || 0) };
}

async function fetchUserWorkflows(serverUrl) {
  const response = await comfyFetch(serverUrl, "/v2/userdata?path=" + encodeURIComponent("workflows"), {}, 15000);
  if (!response.ok) throw new Error(`读取 ComfyUI 工作流列表失败（HTTP ${response.status}）`);
  const entries = await response.json().catch(() => null);
  if (!Array.isArray(entries)) throw new Error("ComfyUI 工作流列表格式异常");
  const files = entries
    .filter(entry => entry && entry.type === "file" && typeof entry.path === "string" && entry.path.startsWith("workflows/") && /\.json$/i.test(entry.path))
    .sort((a, b) => (Number(b.modified || 0)) - (Number(a.modified || 0)))
    .slice(0, USER_WORKFLOW_MAX_FILES);
  const settled = await Promise.allSettled(files.map(async entry => {
    const fileResponse = await comfyFetch(serverUrl, "/userdata/" + encodeURIComponent(String(entry.path)), {}, 30000);
    if (!fileResponse.ok) throw new Error(`HTTP ${fileResponse.status}`);
    let parsed;
    try { parsed = JSON.parse(await fileResponse.text()); } catch { throw new Error("文件不是合法 JSON"); }
    const format = classifyUserWorkflow(parsed);
    const meta = userWorkflowEntryMeta(entry);
    return { ...meta, format, importable: format === "api", workflow: format === "api" ? parsed : undefined };
  }));
  return settled.map((result, index) => {
    const meta = userWorkflowEntryMeta(files[index]);
    if (result.status === "fulfilled") return result.value;
    return { ...meta, format: "unknown", importable: false, error: result.reason?.message || String(result.reason) };
  });
}

function comboOptions(objectInfo, node, field) {
  const value = objectInfo?.[node.class_type]?.input?.required?.[field]?.[0];
  return Array.isArray(value) ? value.map(entry => String(entry)) : null;
}

// 内置工作流载入时的模型适配：hints = [{ nodeId, field, prefer: [[token...], ...] }]。
// 当前值已在可选列表中原样保留；否则按 prefer 优先级找“全部 token 不区分大小写包含”的
// 文件名；全部落空则报错并列出可用文件，提示用户缺哪个模型。
function fitWorkflowModels(workflow, hints, objectInfo) {
  const misses = [];
  for (const hint of Array.isArray(hints) ? hints : []) {
    const node = workflow?.[hint?.nodeId];
    if (!node || !hint.field || !Array.isArray(hint.prefer)) continue;
    const options = comboOptions(objectInfo, node, hint.field);
    if (!options) continue;
    const current = String(node.inputs[hint.field] ?? "");
    if (current && options.includes(current)) continue;
    let matched = "";
    for (const pattern of hint.prefer) {
      const tokens = Array.isArray(pattern) ? pattern.map(token => String(token).toLowerCase()).filter(Boolean) : [];
      if (!tokens.length) continue;
      matched = options.find(name => tokens.every(token => name.toLowerCase().includes(token))) || "";
      if (matched) break;
    }
    if (matched) { node.inputs[hint.field] = matched; continue; }
    const wanted = hint.prefer.map(pattern => Array.isArray(pattern) ? pattern.join("+") : String(pattern)).join(" / ");
    const available = options.slice(0, 8).join("、") + (options.length > 8 ? " 等" : "");
    misses.push(`${node.class_type}.${hint.field}（期望 ${wanted}；本机可用：${available}）`);
  }
  if (misses.length) throw new Error(`本机 ComfyUI 缺少工作流需要的模型：${misses.join("；")}`);
  return workflow;
}

async function preparePrompt(item, payload, serverUrl) {
  const workflow = clone(item.workflow);
  const map = item.mapping;
  // positiveField/negativeField 缺省 "text"（旧存档 mapping 无此键）；MiniMaxH3 等节点的
  // 字段是 prompt，由映射显式给出。promptNodeId/promptField 是旧版视频映射的遗留路径。
  if (map.positiveNodeId && workflow[map.positiveNodeId]?.inputs) workflow[map.positiveNodeId].inputs[map.positiveField || "text"] = String(payload.prompt || "");
  if (map.negativeNodeId && workflow[map.negativeNodeId]?.inputs) workflow[map.negativeNodeId].inputs[map.negativeField || "text"] = String(payload.negativePrompt || "");
  if (map.promptNodeId && workflow[map.promptNodeId]?.inputs) workflow[map.promptNodeId].inputs[map.promptField || "prompt"] = String(payload.prompt || "");
  if (map.durationNodeId && workflow[map.durationNodeId]?.inputs) workflow[map.durationNodeId].inputs[map.durationField || "length"] = videoFrameLength(payload.duration);
  // 通用参数传导（预留接口，目前只开放 width/height）：尺寸由 分辨率(长边)+比例 换算
  const size = sdImageSize(payload.resolution, payload.ratio);
  for (const entry of Array.isArray(map.params) ? map.params : []) {
    if (!entry || !entry.param || !entry.nodeId || !workflow[entry.nodeId]?.inputs) continue;
    if (entry.param === "width" && size) workflow[entry.nodeId].inputs[entry.field || "width"] = size.width;
    else if (entry.param === "height" && size) workflow[entry.nodeId].inputs[entry.field || "height"] = size.height;
    // 后续在此扩展更多传导参数（steps/cfg/…），无需改映射结构
  }
  if (map.samplerNodeId && map.seedField && payload.seed !== undefined && payload.seed !== "") workflow[map.samplerNodeId].inputs[map.seedField] = Math.max(0, Math.floor(Number(payload.seed) || 0));
  if (map.samplerNodeId && map.denoiseField && payload.denoise !== undefined) workflow[map.samplerNodeId].inputs[map.denoiseField] = Math.max(0, Math.min(1, Number(payload.denoise) || 0));
  // 图片输入（2026-11-14 全参数面板扩展）：上游第一张图喂给**全部**图片入口节点
  // （LoadImage/VHS_LoadImage/LoadImageFromPath/GetImageFromPS，按既有 imageField 优先序找字段），
  // 不再只喂映射选中的那一个；蒙版入口排除（仍由 maskData 单独喂）。无图时不上传，
  // 需图工作流由 /prompt 校验报错透传（前端在映射存在时已提前拦截）。
  if (payload.imageData) {
    const uploadedName = await uploadImage(serverUrl, payload.imageData, "source");
    const maskId = map.maskNodeId ? String(map.maskNodeId) : "";
    for (const [id, node] of Object.entries(workflow)) {
      if (id === maskId || !IMAGE_ENTRY_CLASS_RE.test(String(node?.class_type || ""))) continue;
      const field = IMAGE_ENTRY_FIELD_NAMES.find(f => typeof node.inputs?.[f] === "string");
      if (field) node.inputs[field] = uploadedName;
    }
  }
  if (map.maskNodeId) workflow[map.maskNodeId].inputs[map.maskField || "image"] = await uploadImage(serverUrl, payload.maskData, "mask");
  // 全参数面板回传（2026-11-14）：mapping 补丁之后打 paramValues（后者优先），只覆盖已编辑的字段。
  // 键形状 { [nodeId]: { [field]: value } }；与 ComfyUiApi.cs PreparePrompt 逐项对齐（双实现纪律）。
  const paramValues = payload.paramValues;
  if (paramValues && typeof paramValues === "object" && !Array.isArray(paramValues)) {
    for (const [nodeId, fields] of Object.entries(paramValues)) {
      const target = workflow[String(nodeId)];
      if (!target?.inputs || !fields || typeof fields !== "object" || Array.isArray(fields)) continue;
      for (const [field, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        target.inputs[field] = value;
      }
    }
  }
  return workflow;
}

// 虚拟输出注入：工作流没有 SaveImage/SaveVideo 类输出节点时（如 PS 桥接的 SendImageToPS、
// 只回传不落盘的自定义节点），status 端点永远收不到结果——在执行的临时副本上注入一个
// SaveImage 接到结果节点，存储原件不动。注入点判定（pickVirtualOutputNode）：
// ①未被任何节点引用的"终端"节点，沿其 images/image 输入回溯一个节点（结果图生产者）；
// ②无带图链的终端则取未被引用、自身消费图链的节点；③再退取末端最后一个。
// 终端本身是 Save/Preview 类说明有正规输出（正常不会走到注入），返回空。
const VIRTUAL_OUTPUT_ID = "canvasflow_output";
function pickVirtualOutputNode(workflow) {
  const nodes = Object.entries(workflow)
    .map(([id, value]) => ({ id, class_type: value?.class_type, inputs: value?.inputs || {} }))
    .filter(node => typeof node.class_type === "string");
  const referenced = new Set();
  for (const node of nodes) {
    for (const value of Object.values(node.inputs)) {
      if (Array.isArray(value) && typeof value[0] === "string") referenced.add(value[0]);
    }
  }
  const terminals = nodes.filter(node => !referenced.has(node.id));
  // 从最后一个终端倒序找（API 导出的输出端节点在末尾；倒序避免残缺分支里未引用的中间节点抢先命中）
  for (const terminal of [...terminals].reverse()) {
    if (/^(Save|Preview)/i.test(terminal.class_type)) return ""; // 有正规输出节点就不注入（能走到这里说明 mapping 未捕获到输出，二者互斥）
    for (const [field, value] of Object.entries(terminal.inputs)) {
      if (Array.isArray(value) && typeof value[0] === "string" && /image/i.test(field)) return value[0];
    }
  }
  const endNodes = terminals.filter(node => !/^(Save|Preview|Send)/i.test(node.class_type));
  if (!endNodes.length) return "";
  const consumer = endNodes.find(node => Object.values(node.inputs).some(value => Array.isArray(value)));
  return (consumer || endNodes[endNodes.length - 1]).id;
}

// 视频结果落盘：与 /api/download-video 同目录同命名风格（{数据根}/download/videos/），
// 节点只存文件名，播放地址由前端 videoFileUrl() 按运行模式拼装。
function saveVideoFile(dataRoot, bytes, ext) {
  const dir = path.join(dataRoot, "download", "videos");
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `comfyui_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), bytes);
  return fileName;
}

function findHistoryEntry(history, promptId) { return history?.[promptId] || history?.data?.[promptId] || null; }
async function historyOutputs(serverUrl, entry, outputNodeIds, dataRoot) {
  const images = [];
  const videos = [];
  const videoPaths = [];
  // 导入时没识别出输出节点的工作流：兜底遍历全部节点输出（自定义保存节点仍能收结果）
  const nodeIds = (Array.isArray(outputNodeIds) && outputNodeIds.length) ? outputNodeIds : Object.keys(entry?.outputs || {});
  for (const nodeId of nodeIds) {
    const output = entry?.outputs?.[nodeId];
    // VHS_VideoCombine 的输出键是 gifs，其余保存节点普遍是 images，两键都收
    for (const image of [...(output?.images || []), ...(output?.gifs || [])]) {
      if (!image?.filename || !/^[^\\/\0]+$/.test(image.filename)) continue;
      const query = new URLSearchParams({ filename: image.filename, subfolder: String(image.subfolder || ""), type: String(image.type || "output") });
      const response = await comfyFetch(serverUrl, `/view?${query}`, {}, 60000);
      if (!response.ok) throw new Error(`读取 ComfyUI 输出失败（HTTP ${response.status}）`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const ext = (String(image.filename).split(".").pop() || "").toLowerCase();
      if (VIDEO_OUTPUT_EXTS.has(ext)) {
        const fileName = saveVideoFile(dataRoot, bytes, ext);
        videos.push(fileName);
        videoPaths.push(path.join(dataRoot, "download", "videos", fileName));
      }
      else images.push(`data:${response.headers.get("content-type") || "image/png"};base64,${bytes.toString("base64")}`);
    }
  }
  return { images, videos, videoPaths };
}

async function handle(req, res, context) {
  const pathname = context.pathname;
  if (!pathname.startsWith("/api/comfyui/")) return false;
  try {
    const store = loadStore(context.dataRoot);
    if (pathname === "/api/comfyui/config" && req.method === "GET") return json(res, 200, store);
    if (pathname === "/api/comfyui/config" && req.method === "POST") {
      const body = await readJson(req);
      store.config.serverUrl = normalizeServerUrl(body.serverUrl || store.config.serverUrl);
      if (typeof body.installPath === "string") store.config.installPath = body.installPath.trim();
      if (typeof body.launchPath === "string") store.config.launchPath = body.launchPath.trim();
      saveStore(context.dataRoot, store);
      return json(res, 200, { ok: true, config: store.config });
    }
    if (pathname === "/api/comfyui/test" && req.method === "POST") {
      const body = await readJson(req);
      const serverUrl = normalizeServerUrl(body.serverUrl || store.config.serverUrl);
      const response = await comfyFetch(serverUrl, "/system_stats", {}, 8000);
      if (!response.ok) throw new Error(`ComfyUI 返回 HTTP ${response.status}`);
      return json(res, 200, { ok: true, serverUrl });
    }
    if (pathname === "/api/comfyui/workflows/user-list" && req.method === "POST") {
      const body = await readJson(req);
      const serverUrl = normalizeServerUrl(body.serverUrl || store.config.serverUrl);
      const items = await fetchUserWorkflows(serverUrl);
      return json(res, 200, { ok: true, serverUrl, items });
    }
    // 全参数面板：按类取 object_info 子集（combo 选项/数值范围/多行标记），见 fetchObjectInfoSubset
    if (pathname === "/api/comfyui/object-info" && req.method === "POST") {
      const body = await readJson(req);
      const serverUrl = normalizeServerUrl(body.serverUrl || store.config.serverUrl);
      const info = await fetchObjectInfoSubset(serverUrl, body.classes);
      return json(res, 200, { ok: true, serverUrl, info });
    }
    if (pathname === "/api/comfyui/workflows/import" && req.method === "POST") {
      const body = await readJson(req);
      const type = String(body.type || "") || detectWorkflowType(body.workflow);
      const templateId = String(body.templateId || "").trim();
      if (templateId) {
        const existing = store.workflows.find(entry => entry.templateId === templateId);
        if (existing) return json(res, 200, { ok: true, existed: true, workflow: { ...existing, workflow: undefined } });
      }
      let workflow = body.workflow;
      if (Array.isArray(body.hints) && body.hints.length) {
        const serverUrl = normalizeServerUrl(body.serverUrl || store.config.serverUrl);
        workflow = fitWorkflowModels(workflow, body.hints, await fetchObjectInfo(serverUrl));
      }
      const mapping = detectWorkflowMapping(workflow);
      const item = { id: crypto.randomUUID(), name: String(body.name || "").trim() || "未命名工作流", type, workflow, mapping, updatedAt: Date.now() };
      if (templateId) item.templateId = templateId;
      store.workflows.push(item); saveStore(context.dataRoot, store);
      return json(res, 200, { ok: true, workflow: { ...item, workflow: undefined } });
    }
    if (pathname === "/api/comfyui/workflows/update" && req.method === "POST") {
      const body = await readJson(req);
      const item = store.workflows.find(entry => entry.id === body.id);
      if (!item) return json(res, 404, { error: "工作流不存在" });
      if (body.name !== undefined) item.name = String(body.name || "").trim() || item.name;
      if (body.workflow) { item.workflow = body.workflow; item.mapping = detectWorkflowMapping(item.workflow); }
      item.updatedAt = Date.now(); saveStore(context.dataRoot, store);
      return json(res, 200, { ok: true });
    }
    if (pathname === "/api/comfyui/workflows/delete" && req.method === "POST") {
      const body = await readJson(req);
      const index = store.workflows.findIndex(entry => entry.id === body.id);
      if (index < 0) return json(res, 404, { error: "工作流不存在" });
      store.workflows.splice(index, 1); saveStore(context.dataRoot, store);
      return json(res, 200, { ok: true });
    }
    if (pathname === "/api/comfyui/workflows/reorder" && req.method === "POST") {
      const body = await readJson(req);
      const order = Array.isArray(body.ids) ? body.ids : [];
      const rank = new Map(order.map((id, index) => [id, index]));
      store.workflows.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)); saveStore(context.dataRoot, store);
      return json(res, 200, { ok: true });
    }
    if (pathname === "/api/comfyui/run" && req.method === "POST") {
      const body = await readJson(req);
      const item = store.workflows.find(entry => entry.id === body.workflowId);
      if (!item) return json(res, 404, { error: "工作流已删除或不存在" });
      const serverUrl = normalizeServerUrl(body.serverUrl || store.config.serverUrl);
      const prompt = await preparePrompt(item, body, serverUrl);
      // 无正规输出节点的工作流（PS 桥接等）：注入 SaveImage 才能拿回结果（见 pickVirtualOutputNode）
      let outputNodeIds = Array.isArray(item.mapping?.outputNodeIds) ? item.mapping.outputNodeIds : [];
      if (!outputNodeIds.length) {
        const virtualTarget = pickVirtualOutputNode(prompt);
        if (virtualTarget) {
          prompt[VIRTUAL_OUTPUT_ID] = { class_type: "SaveImage", inputs: { images: [virtualTarget, 0], filename_prefix: "canvasflow" }, _meta: { title: "CanvasFlow Output" } };
          outputNodeIds = [VIRTUAL_OUTPUT_ID];
        }
      }
      const clientId = `canvasflow-${crypto.randomUUID()}`;
      const response = await comfyFetch(serverUrl, "/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, client_id: clientId }) }, 60000);
      const result = await response.json().catch(() => ({}));
      const promptId = result.prompt_id;
      if (!response.ok || !promptId) throw new Error(result.error?.message || result.error || `提交工作流失败（HTTP ${response.status}）`);
      const taskId = crypto.randomUUID();
      tasks.set(taskId, { taskId, promptId, serverUrl, outputNodeIds, createdAt: Date.now(), cancelled: false });
      return json(res, 200, { ok: true, taskId, promptId });
    }
    if (pathname.startsWith("/api/comfyui/status/") && req.method === "GET") {
      const taskId = pathname.slice("/api/comfyui/status/".length);
      const task = tasks.get(taskId);
      if (!task) return json(res, 404, { error: "任务不存在或已过期" });
      if (task.cancelled) return json(res, 200, { status: "cancelled" });
      const response = await comfyFetch(task.serverUrl, `/history/${encodeURIComponent(task.promptId)}`, {}, 30000);
      const history = await response.json().catch(() => ({}));
      const entry = findHistoryEntry(history, task.promptId);
      if (!entry) return json(res, 200, { status: "running" });
      const messages = entry.status?.messages || [];
      const executionError = messages.find(message => message?.[0] === "execution_error");
      // 与 ComfyUiApi.cs 同步：执行错误也是终态，删除任务（前端收到 failed 后即停轮询）
      if (executionError) { tasks.delete(taskId); return json(res, 200, { status: "failed", error: executionError[1]?.exception_message || "ComfyUI 执行失败" }); }
      // 与 ComfyUiApi.cs 同步：中断也是失败终态，别落到“没有输出”兜底
      if (messages.some(message => message?.[0] === "execution_interrupted")) { tasks.delete(taskId); return json(res, 200, { status: "failed", error: "ComfyUI 任务被中断" }); }
      const outputs = await historyOutputs(task.serverUrl, entry, task.outputNodeIds, context.dataRoot);
      if (!outputs.images.length && !outputs.videos.length) return json(res, 200, { status: "failed", error: "工作流已完成，但没有找到图片或视频输出" });
      tasks.delete(taskId);
      return json(res, 200, { status: "succeeded", images: outputs.images, videos: outputs.videos, videoPaths: outputs.videoPaths });
    }
    if (pathname === "/api/comfyui/cancel" && req.method === "POST") {
      const body = await readJson(req);
      const task = tasks.get(body.taskId);
      if (!task) return json(res, 200, { ok: true });
      task.cancelled = true;
      await comfyFetch(task.serverUrl, "/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delete: [task.promptId] }) }, 10000).catch(() => null);
      await comfyFetch(task.serverUrl, "/interrupt", { method: "POST" }, 10000).catch(() => null);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "ComfyUI 路由不存在" });
  } catch (error) {
    return json(res, 400, { error: error.message || "ComfyUI 请求失败" });
  }
}

module.exports = { handle, detectWorkflowMapping, detectWorkflowType, normalizeServerUrl, loadStore, fitWorkflowModels, fetchObjectInfo, fetchObjectInfoSubset, fetchUserWorkflows, classifyUserWorkflow, videoFrameLength, sdImageSize, pickVirtualOutputNode, VIRTUAL_OUTPUT_ID, preparePrompt, IMAGE_ENTRY_CLASS_RE, IMAGE_ENTRY_FIELD_NAMES };
