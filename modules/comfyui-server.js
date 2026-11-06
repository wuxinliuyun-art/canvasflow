const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WORKFLOW_TYPES = new Set(["txt2img", "img2img", "upscale", "matting", "inpaint", "video-i2v", "video-t2v"]);
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

function detectWorkflowMapping(type, workflow) {
  if (!WORKFLOW_TYPES.has(type)) throw new Error("不支持的本地 SD 功能类型");
  const nodes = workflowNodes(workflow);
  const byClass = className => nodes.filter(node => node.class_type === className);
  const textNodes = byClass("CLIPTextEncode");
  const imageNodes = byClass("LoadImage");
  const samplerNodes = nodes.filter(node => /KSampler/.test(node.class_type));
  const outputNodes = nodes.filter(node => /^(SaveImage|PreviewImage|SaveAnimatedWEBP|SaveVideo)$/.test(node.class_type));
  if (!outputNodes.length) throw new Error("工作流缺少 SaveImage、PreviewImage 或 SaveVideo 输出节点");

  const mapping = { outputNodeIds: outputNodes.map(node => node.id) };
  if (["txt2img", "img2img", "inpaint"].includes(type)) {
    if (!textNodes.length) throw new Error("工作流缺少 CLIPTextEncode 提示词节点");
    const negative = textNodes.find(node => /negative|负面|反向/.test(titleOf(node))) || textNodes[1] || null;
    const positive = textNodes.find(node => node !== negative && /positive|正面|提示词/.test(titleOf(node))) || textNodes.find(node => node !== negative) || textNodes[0];
    mapping.positiveNodeId = positive.id;
    mapping.negativeNodeId = negative?.id || "";
  }
  // 采样器映射对视频类型同样生效（视频模板也用经典 KSampler，便于改 seed）
  if (["txt2img", "img2img", "inpaint", "video-i2v", "video-t2v"].includes(type)) {
    if (samplerNodes.length > 1) throw new Error("工作流包含多个采样器，首版无法确定要修改哪一个");
    if (samplerNodes.length) {
      mapping.samplerNodeId = samplerNodes[0].id;
      mapping.seedField = firstField(samplerNodes[0], ["seed", "noise_seed"]);
      mapping.denoiseField = firstField(samplerNodes[0], ["denoise"]);
    }
  }
  // 视频类型：提示词与时长直接写在 MiniMaxH3 节点上（不走 CLIPTextEncode）
  if (type === "video-i2v" || type === "video-t2v") {
    const h3Nodes = nodes.filter(node => /^MiniMaxH3/.test(node.class_type));
    if (h3Nodes.length !== 1) throw new Error("视频工作流需要恰好一个 MiniMaxH3 节点");
    if (!Object.prototype.hasOwnProperty.call(h3Nodes[0].inputs || {}, "prompt")) throw new Error("MiniMaxH3 节点缺少 prompt 输入");
    mapping.promptNodeId = h3Nodes[0].id;
    mapping.promptField = "prompt";
    if (Object.prototype.hasOwnProperty.call(h3Nodes[0].inputs, "length")) {
      mapping.durationNodeId = h3Nodes[0].id;
      mapping.durationField = "length";
    }
  }
  // 通用参数传导接口（预留）：params = [{ param, nodeId, field }, ...]，目前只实现 width/height
  // （图片尺寸），后续可在此扩展 steps/cfg 等参数而无需改结构。尺寸目标 = 恰好一个同时具有
  // 数值型 width/height 输入的节点（EmptyFlux2LatentImage / EmptySD3LatentImage / MiniMaxH3 等）。
  if (["txt2img", "video-i2v", "video-t2v"].includes(type)) {
    const isNumber = value => typeof value === "number" && Number.isFinite(value);
    const sizeCandidates = nodes.filter(node => isNumber(node.inputs?.width) && isNumber(node.inputs?.height));
    const sizeNode = sizeCandidates.length === 1 ? sizeCandidates[0]
      : sizeCandidates.find(node => /Latent|MiniMaxH3/i.test(node.class_type)) || null;
    if (sizeNode) {
      mapping.params = [
        { param: "width", nodeId: sizeNode.id, field: "width" },
        { param: "height", nodeId: sizeNode.id, field: "height" },
      ];
    }
  }
  if (["img2img", "upscale", "matting", "inpaint", "video-i2v"].includes(type)) {
    if (!imageNodes.length) throw new Error("该功能工作流缺少 LoadImage 输入节点");
    const mask = imageNodes.find(node => /mask|蒙版|遮罩/.test(titleOf(node)));
    const source = imageNodes.find(node => node !== mask && /source|image|原图|输入/.test(titleOf(node))) || imageNodes.find(node => node !== mask) || imageNodes[0];
    mapping.imageNodeId = source.id;
    if (type === "inpaint") {
      if (!mask) throw new Error("局部重绘工作流需要一个标题包含 mask、蒙版或遮罩的 LoadImage 节点");
      mapping.maskNodeId = mask.id;
    }
  }
  if (type === "upscale" && !nodes.some(node => /Upscale|ScaleBy|ScaleToTotalPixels/.test(node.class_type))) throw new Error("放大工作流缺少可识别的 Upscale 节点");
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
    return { config: { serverUrl: "http://127.0.0.1:8188", installPath: "", launchPath: "", ...(parsed.config || {}) }, workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [] };
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
  if (map.positiveNodeId) workflow[map.positiveNodeId].inputs.text = String(payload.prompt || "");
  if (map.negativeNodeId) workflow[map.negativeNodeId].inputs.text = String(payload.negativePrompt || "");
  // 视频类型：提示词/时长直接写在 MiniMaxH3 节点字段上（promptField/durationField 由映射给出）
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
  if (map.imageNodeId) workflow[map.imageNodeId].inputs.image = await uploadImage(serverUrl, payload.imageData, "source");
  if (map.maskNodeId) workflow[map.maskNodeId].inputs.image = await uploadImage(serverUrl, payload.maskData, "mask");
  return workflow;
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
  for (const nodeId of outputNodeIds || []) {
    const output = entry?.outputs?.[nodeId];
    for (const image of output?.images || []) {
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
      const mapping = detectWorkflowMapping(type, workflow);
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
      if (body.workflow) { item.workflow = body.workflow; item.mapping = detectWorkflowMapping(item.type, item.workflow); }
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
      const clientId = `canvasflow-${crypto.randomUUID()}`;
      const response = await comfyFetch(serverUrl, "/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, client_id: clientId }) }, 60000);
      const result = await response.json().catch(() => ({}));
      const promptId = result.prompt_id;
      if (!response.ok || !promptId) throw new Error(result.error?.message || result.error || `提交工作流失败（HTTP ${response.status}）`);
      const taskId = crypto.randomUUID();
      tasks.set(taskId, { taskId, promptId, serverUrl, outputNodeIds: item.mapping.outputNodeIds, createdAt: Date.now(), cancelled: false });
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
      if (executionError) return json(res, 200, { status: "failed", error: executionError[1]?.exception_message || "ComfyUI 执行失败" });
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

module.exports = { handle, detectWorkflowMapping, detectWorkflowType, normalizeServerUrl, loadStore, fitWorkflowModels, fetchObjectInfo, videoFrameLength, sdImageSize };
