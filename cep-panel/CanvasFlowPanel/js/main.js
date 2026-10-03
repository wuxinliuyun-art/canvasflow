// CanvasFlow PS 联动面板 demo：导出文档/选区蒙版 → agtoken /v1/images/edits → 结果回贴为新图层。
// 请求格式与 CanvasFlow 主程序对 agtoken 的约定一致（JSON body、images 数组、Bearer 鉴权）。
(() => {
  "use strict";

  const cs = new CSInterface();

  // 与 model-catalog.js 保持一致；agtoken/apimart 标记该模型走哪条通道。
  // apimart 的 flare/sunburst 需要 ext 映射（gpt-image-2.5-ext + version），仅画布通道生效。
  const MODELS = [
    { id: "gpt-image-2.5", label: "GPT Image 2.5", quality: ["low", "medium", "high"], agtoken: true, apimart: true },
    { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare（快速）", quality: ["low", "medium", "high", "xhigh", "max"], agtoken: true, apimart: true, ext: "flare" },
    { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst（质量）", quality: ["low", "medium", "high", "xhigh", "max"], agtoken: true, apimart: true, ext: "sunburst" },
    { id: "gpt-image-2", label: "GPT Image 2", quality: ["low", "medium", "high"], agtoken: true, apimart: true },
    { id: "nano-banana-2", label: "Nano Banana 2", quality: null, agtoken: true, apimart: false },
    { id: "nano-banana-pro", label: "Nano Banana Pro", quality: null, agtoken: true, apimart: false },
    { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro（APIMart）", quality: null, agtoken: false, apimart: true },
  ];
  const DEFAULT_MODEL = "gpt-image-2.5-flare";
  const AGTOKEN_EDITS_URL = "https://agtoken.vip/v1/images/edits";
  const DEFAULT_CANVAS_URL = "http://127.0.0.1:5173";
  const REQUEST_TIMEOUT_MS = 600000; // agtoken 同步接口的官方建议上限

  // host.jsx 是纯 ASCII 输出，这里把常见英文报错翻回中文
  const PS_MESSAGES = [
    ["No document is open", "PS 中没有打开的文档"],
    ["No active selection", "当前文档没有活动选区"],
    ["Export failed", "导出失败"],
    ["Export document failed", "导出当前文档失败"],
    ["Export mask failed", "导出选区蒙版失败"],
    ["Place image failed", "结果回贴失败"],
    ["Result file is missing", "结果文件丢失"],
    ["Cannot create temp folder", "临时目录创建失败"],
  ];

  const $ = id => document.getElementById(id);
  const els = {
    docLine: $("docLine"), apiKey: $("apiKey"), model: $("model"), size: $("size"),
    quality: $("quality"), prompt: $("prompt"), sendMask: $("sendMask"),
    generateBtn: $("generateBtn"), log: $("log"), preview: $("preview"),
    progressWrap: $("progressWrap"), progressBar: $("progressBar"), progressText: $("progressText"),
    upcompress: $("upcompress"), channel: $("channel"), canvasUrl: $("canvasUrl"),
    selMode: $("selMode"),
  };

  // 同步接口拿不到真实进度：导出/回贴阶段给确定刻度，生成等待段按指数渐近推进
  //（约 90 秒爬到 50%，3 分钟到 ~78%，封顶 92%），配合已等待秒数展示。
  const progress = {
    timer: null,
    show() { els.progressWrap.hidden = false; this.set(2, "准备中…"); },
    set(pct, text) {
      els.progressBar.style.width = Math.max(0, Math.min(100, pct)) + "%";
      if (text) els.progressText.textContent = text;
    },
    startWait(basePct, spanPct) {
      const startAt = Date.now();
      this.stopWait();
      this.timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - startAt) / 1000);
        const pct = basePct + spanPct * (1 - Math.exp(-seconds / 90));
        this.set(pct, `生成中… 已等待 ${seconds} 秒（同步接口无真实进度，最长 600 秒）`);
      }, 500);
    },
    stopWait() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
    done() { this.stopWait(); this.set(100, "完成"); setTimeout(() => { els.progressWrap.hidden = true; }, 4000); },
    fail() { this.stopWait(); els.progressWrap.hidden = true; },
  };

  const store = {
    get(key) { try { return localStorage.getItem("cfps_" + key) || ""; } catch (e) { return ""; } },
    set(key, value) { try { localStorage.setItem("cfps_" + key, value); } catch (e) { /* 忽略 */ } },
  };

  function log(message, cls) {
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = message;
    els.log.appendChild(line);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function translate(message) {
    const text = String(message || "");
    for (const [prefix, zh] of PS_MESSAGES) {
      if (text.indexOf(prefix) === 0) {
        const detail = text.slice(prefix.length).replace(/^[:：]\s*/, "");
        return detail ? zh + "：" + detail : zh;
      }
    }
    return text;
  }

  function evalJsx(expression) {
    return new Promise((resolve, reject) => {
      cs.evalScript(expression, result => {
        if (result === CSInterface.EVAL_SCRIPT_ERROR) return reject(new Error("PS 脚本执行失败（面板与 PS 通信异常）"));
        resolve(String(result == null ? "" : result));
      });
    });
  }

  // host.jsx 约定："ok|a|b" 或 "err|原因"
  function parseResult(raw) {
    const parts = String(raw || "").split("|");
    if (parts[0] === "ok") return { ok: true, parts: parts.slice(1) };
    if (parts[0] === "err") return { ok: false, error: parts.slice(1).join("|") || "未知错误" };
    return { ok: false, error: "无法解析 PS 返回：" + String(raw || "(空)").slice(0, 120) };
  }

  function nodeContext() {
    try {
      const req = window.nodeRequire || window.require;
      if (typeof req === "function") return { fs: req("fs"), os: req("os"), path: req("path") };
    } catch (e) { /* Node 未启用时走 cep.fs 兜底 */ }
    return null;
  }

  function cepFsEncoding(name, fallback) {
    try { return (window.cep && window.cep.fs && window.cep.fs.encoding && window.cep.fs.encoding[name]) || fallback; }
    catch (e) { return fallback; }
  }

  function ensureTempDir() {
    const io = nodeContext();
    if (io) {
      const dir = io.path.join(io.os.tmpdir(), "canvasflow-ps");
      if (!io.fs.existsSync(dir)) io.fs.mkdirSync(dir, { recursive: true });
      return dir;
    }
    if (!window.cep || !window.cep.fs) throw new Error("CEP 文件接口不可用（面板未运行在 Photoshop 里，且 Node 也未启用）");
    const dir = cs.getSystemPath(CSInterface.SystemPath.EXTENSION) + "/tmp";
    const result = window.cep.fs.makeDir(dir);
    if (result.err !== 0 && result.err !== 17 /* already exists */) throw new Error("临时目录创建失败：" + dir);
    return dir;
  }

  function readBase64(path) {
    const io = nodeContext();
    if (io) return io.fs.readFileSync(path).toString("base64");
    const result = window.cep.fs.readFile(path, cepFsEncoding("BASE64", "Base64"));
    if (result.err !== 0) throw new Error("读取文件失败：" + path);
    return result.data;
  }

  function writeBase64(path, base64) {
    const io = nodeContext();
    if (io) {
      io.fs.writeFileSync(path, Buffer.from(base64, "base64"));
      return;
    }
    const result = window.cep.fs.writeFile(path, base64, cepFsEncoding("BASE64", "Base64"));
    if (result.err !== 0) throw new Error("写入文件失败：" + path);
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    return btoa(binary);
  }

  function postJson(url, payload, headers, timeoutMs, onPhase) {
    const options = {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
      body: JSON.stringify(payload),
    };
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = controller ? setTimeout(() => controller.abort(), timeoutMs || REQUEST_TIMEOUT_MS) : null;
    if (controller) options.signal = controller.signal;
    return fetch(url, options).then(async resp => {
      if (onPhase) onPhase("headers"); // 请求已发出且上游返回了响应头（同步接口=上传+生成完成）
      const text = await resp.text();
      if (onPhase) onPhase("body");
      if (timer) clearTimeout(timer);
      let data = null;
      try { data = JSON.parse(text); } catch (e) { /* 保留原文进错误 */ }
      if (!resp.ok || !data) throw new Error("HTTP " + resp.status + (text ? "：" + text.slice(0, 300) : ""));
      if (data.error) throw new Error(data.error.message || data.error.code || "HTTP " + resp.status);
      return data;
    }, error => {
      if (timer) clearTimeout(timer);
      if (error && error.name === "AbortError") throw new Error("请求超时（" + Math.round((timeoutMs || REQUEST_TIMEOUT_MS) / 1000) + " 秒）");
      throw new Error(String(error && error.message || error));
    });
  }

  // ---- 画布通道：画布开着时优先走本机画布（两套 API 都可用、桌面端免 key）----
  function readBridge() {
    const io = nodeContext();
    if (!io || typeof process === "undefined" || !process.env || !process.env.APPDATA) return null;
    try {
      const file = io.path.join(process.env.APPDATA, "CanvasFlowBridge", "bridge.json");
      const data = JSON.parse(io.fs.readFileSync(file, "utf8"));
      return data && Number(data.port) > 0 ? data : null;
    } catch (e) { return null; }
  }

  async function probeCanvas(baseUrl) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3000) : null;
    try {
      const resp = await fetch(baseUrl.replace(/\/+$/, "") + "/api/models", { signal: controller ? controller.signal : undefined });
      return resp.status < 500; // 有任何 HTTP 应答都说明画布在这一端口
    } catch (e) {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function resolveCanvasBase() {
    const candidates = [];
    const manual = store.get("canvasUrl").trim();
    if (manual) candidates.push(manual.replace(/\/+$/, ""));
    const bridge = readBridge();
    if (bridge) candidates.push("http://127.0.0.1:" + bridge.port);
    if (candidates.indexOf(DEFAULT_CANVAS_URL) < 0) candidates.push(DEFAULT_CANVAS_URL);
    for (const base of candidates) {
      if (await probeCanvas(base)) return base;
    }
    return "";
  }

  function canvasHeaders(bridge) {
    const headers = {};
    const key = store.get("apiKey").trim();
    if (key) headers["X-CanvasFlow-Api-Key"] = key;
    if (bridge && bridge.token) headers["X-CanvasFlow-Bridge"] = bridge.token;
    return headers;
  }

  // APIMart：提交任务 → 轮询（有真实进度）→ 下载结果
  async function generateViaCanvasApimart(canvasBase, model, payload, bridge, onProgress) {
    const headers = canvasHeaders(bridge);
    const submit = { model: model.ext ? "gpt-image-2.5-ext" : model.id, prompt: payload.prompt, n: payload.n };
    if (model.ext) { submit.version = model.ext; submit.resolution = String(els.size.value).toUpperCase(); }
    else submit.resolution = els.size.value;
    if (model.id === "gpt-image-2") submit.quality = (!els.quality.disabled && els.quality.value !== "auto") ? els.quality.value : "medium";
    else if (!model.ext && model.quality) submit.quality = els.quality.value;
    if (payload.images) submit.image_urls = payload.images;
    const submitStart = beginStage();
    const submitted = await postJson(canvasBase + "/api/generate", submit, headers);
    const taskId = (submitted.data && (submitted.data.id || (submitted.data[0] && submitted.data[0].task_id))) || "";
    if (!taskId) throw new Error("画布未返回任务ID");
    log(`任务已提交：${taskId}（提交 ${endStage("提交", submitStart)}s）`, "muted");
    const pollStart = beginStage();
    for (let attempt = 0; attempt < 360; attempt++) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1000));
      const data = await postJson(canvasBase + "/api/task/" + encodeURIComponent(taskId), {}, headers, 30000).catch(error => {
        if (String(error.message).indexOf("HTTP 5") === 0 || String(error.message).indexOf("HTTP 429") === 0) return null;
        throw error;
      });
      if (!data || !data.data) continue;
      if (data.data.status === "completed") {
        log(`生成完成（轮询 ${endStage("轮询", pollStart)}s）`, "muted");
        const images = (data.data.result && data.data.result.images) || [];
        const urls = [];
        for (const image of images) {
          const list = Array.isArray(image && image.url) ? image.url : [image && image.url];
          for (const url of list) if (url) urls.push(url);
        }
        if (!urls.length) throw new Error("任务完成但无图片结果");
        if (String(urls[0]).startsWith("data:image/")) return String(urls[0]).replace(/^data:image\/\w+;base64,/, "");
        const downloadStart = beginStage();
        const downloaded = await postJson(canvasBase + "/api/download-image", { imageUrl: urls[0] }, headers, 120000);
        if (!downloaded.base64) throw new Error("结果图下载失败");
        log(`结果图下载 ${endStage("下载", downloadStart)}s`, "muted");
        return String(downloaded.base64).replace(/^data:image\/\w+;base64,/, "");
      }
      if (data.data.status === "failed") throw new Error((data.data.error && data.data.error.message) || "生成失败");
      if (typeof onProgress === "function") onProgress(Number(data.data.progress) || 0);
    }
    throw new Error("任务超时（6 分钟），可稍后在画布中查看结果");
  }

  function currentModelDef() {
    return MODELS.find(item => item.id === els.model.value) || MODELS[0];
  }

  function populateModels() {
    els.model.innerHTML = "";
    for (const def of MODELS) {
      const option = document.createElement("option");
      option.value = def.id;
      option.textContent = def.label;
      els.model.appendChild(option);
    }
    els.model.value = store.get("model") || DEFAULT_MODEL;
    if (!els.model.value) els.model.value = DEFAULT_MODEL;
    populateQuality();
  }

  function populateQuality() {
    const def = currentModelDef();
    const previous = store.get("quality") || "auto";
    els.quality.innerHTML = "";
    const options = def.quality || ["auto"];
    for (const value of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value === "auto" ? "自动" : value;
      els.quality.appendChild(option);
    }
    els.quality.value = def.quality ? (options.indexOf(previous) >= 0 ? previous : "low") : "auto";
    els.quality.disabled = !def.quality;
  }

  function restoreSettings() {
    els.apiKey.value = store.get("apiKey");
    els.size.value = store.get("size") || "1k";
    els.prompt.value = store.get("prompt");
    els.sendMask.checked = store.get("sendMask") !== "0";
    els.upcompress.value = store.get("upcompress") || "jpeg1536";
    els.channel.value = store.get("channel") || "auto";
    els.canvasUrl.value = store.get("canvasUrl") || "";
    els.selMode.value = store.get("selMode") || "red";
    els.sendMask.disabled = els.selMode.value === "red";
  }

  function saveSettings() {
    store.set("apiKey", els.apiKey.value.trim());
    store.set("model", els.model.value);
    store.set("size", els.size.value);
    store.set("quality", els.quality.value);
    store.set("prompt", els.prompt.value);
    store.set("sendMask", els.sendMask.checked ? "1" : "0");
    store.set("upcompress", els.upcompress.value);
    store.set("channel", els.channel.value);
    store.set("canvasUrl", els.canvasUrl.value.trim());
    store.set("selMode", els.selMode.value);
  }

  function setBusy(busy) {
    els.generateBtn.disabled = busy;
    els.generateBtn.textContent = busy ? "生成中…" : "生成并回贴到 PS";
  }

  function showPreview(path) {
    els.preview.src = "file:///" + path.replace(/\\/g, "/").split("?")[0].split("#")[0].split("/").map(encodeURIComponent).join("/");
    els.preview.hidden = false;
  }

  // ---- 阶段计时：定位“面板总耗时 ≫ 上游生成耗时”时时间花在哪一环 ----
  let t0 = 0;
  const timings = [];
  function nowSec() { return performance.now(); }
  function beginStage() { return nowSec(); }
  function endStage(label, startedAt) {
    const ms = nowSec() - startedAt;
    timings.push({ label, ms });
    return (ms / 1000).toFixed(1);
  }
  function summaryLine() {
    return "总用时 " + ((nowSec() - t0) / 1000).toFixed(1) + "s ｜ "
      + timings.map(item => item.label + " " + (item.ms / 1000).toFixed(1) + "s").join(" · ");
  }

  async function generate() {
    setBusy(true);
    els.log.innerHTML = "";
    progress.show();
    t0 = nowSec();
    timings.length = 0;
    try {
      const channelMode = els.channel.value; // auto | canvas | direct
      let canvasBase = "";
      if (channelMode !== "direct") {
        progress.set(3, "寻找画布…");
        const probeStart = beginStage();
        canvasBase = await resolveCanvasBase();
        const probeSec = endStage("寻找画布", probeStart);
        if (!canvasBase && channelMode === "canvas") {
          throw new Error("没有找到运行中的画布：请确认桌面版 CanvasFlow 已启动（或 node server.js 正在运行），或在下方手动填写画布地址");
        }
        if (canvasBase) log(`已连接画布：${canvasBase}（探测 ${probeSec}s）`, "muted");
        else log(`未找到画布，走直连（探测耗时 ${probeSec}s）`, "muted");
      }

      const tempDir = ensureTempDir();
      const base = "cf-" + Date.now();

      const compress = els.upcompress.value;
      const fmt = compress.indexOf("jpeg") === 0 ? "jpeg" : "png";
      const maxEdge = parseInt(compress.replace(/^[a-z]+/, ""), 10) || 0;
      const wantRed = els.selMode.value === "red";

      // 一次 JSX 调用完成：存选区通道 → 导蒙版 PNG → 导上传图（红色标记或原图）
      progress.set(4, "导出文档与选区…");
      log(wantRed ? "导出当前文档（有选区时叠加红色标记）…" : "导出当前文档…", "muted");
      const exportStart = beginStage();
      const exportResult = parseResult(await evalJsx(`CF_exportAll(${JSON.stringify(tempDir)},${JSON.stringify(base)},${JSON.stringify(fmt)},${maxEdge},${wantRed})`));
      if (!exportResult.ok) throw new Error(translate(exportResult.error));
      const imagePath = exportResult.parts[0];
      const imagePrefix = exportResult.parts[3] === "jpeg" ? "data:image/jpeg;base64," : "data:image/png;base64,";
      const maskPath = exportResult.parts[4] || "";
      const hasSelection = exportResult.parts[5] === "1";
      const appliedRed = exportResult.parts[6] === "1";
      log(`已导出 ${exportResult.parts[1] || ""}（${exportResult.parts[3] || "png"}，${endStage("导出", exportStart)}s）`);
      if (hasSelection && wantRed && !appliedRed) log("警告：选区通道异常，红色标记未能应用，本次按整图处理", "err");
      else if (hasSelection && appliedRed) log("红色选区标记已应用，提示词已附加隐藏指令", "muted");
      else if (hasSelection) log("检测到选区，回贴时按选区本地剪裁", "muted");
      else log("无选区，整图模式", "muted");

      const model = currentModelDef();
      // 红色标记模式：发送时在提示词末尾追加隐藏指令，不在输入框中显示
      const RED_INSTRUCTION = "重新生成图片中的红色半透明标记区域，其余部分保持原样，最终图中不要残留红色标记";
      const userPrompt = els.prompt.value.trim();
      const redMode = hasSelection && wantRed && appliedRed; // 以实际生效为准
      const finalPrompt = redMode
        ? (userPrompt ? userPrompt + "。" + RED_INSTRUCTION : RED_INSTRUCTION)
        : (userPrompt || "edit this image");
      const imageDataUrl = imagePrefix + readBase64(imagePath);
      let resultBase64 = "";

      const buildAgtokenPayload = () => {
        const payload = { model: els.model.value, prompt: finalPrompt, n: 1, size: els.size.value, response_format: "b64_json", images: [imageDataUrl] };
        if (!els.quality.disabled && els.quality.value !== "auto") payload.quality = els.quality.value;
        if (maskPath && els.sendMask.checked && !redMode) payload.mask = "data:image/png;base64," + readBase64(maskPath);
        return payload;
      };
      const extractAgtokenBase64 = async (data, headers, canvasBase) => {
        const item = (Array.isArray(data.data) ? data.data : [])[0];
        if (!item) throw new Error("接口返回成功但没有图片结果");
        if (item.b64_json) return String(item.b64_json).replace(/^data:image\/\w+;base64,/, "");
        if (item.url) {
          const downloadStart = beginStage();
          if (canvasBase) {
            const downloaded = await postJson(canvasBase + "/api/download-image", { imageUrl: item.url }, headers, 120000);
            log(`结果图下载 ${endStage("下载", downloadStart)}s`, "muted");
            return String(downloaded.base64 || "").replace(/^data:image\/\w+;base64,/, "");
          }
          progress.set(92, "下载结果图…");
          const resp = await fetch(item.url);
          if (!resp.ok) throw new Error("结果图下载失败：HTTP " + resp.status);
          const result = arrayBufferToBase64(await resp.arrayBuffer());
          log(`结果图下载 ${endStage("下载", downloadStart)}s`, "muted");
          return result;
        }
        throw new Error("返回中没有 b64_json 或 url");
      };

      if (canvasBase && model.agtoken) {
        if (!els.apiKey.value.trim()) log("提示：未填 key。桌面版画布会自动使用已保存的 key；服务器模式请确认画布网页里已填 key 或在面板里填一次", "muted");
        log("画布通道 · agtoken（模型 " + els.model.value + "）…", "muted");
        progress.startWait(8, 84);
        const reqStart = beginStage();
        let bodyStart = 0;
        const data = await postJson(canvasBase + "/api/agtoken/edits", buildAgtokenPayload(), canvasHeaders(readBridge()), 0, phase => {
          if (phase === "headers") {
            log(`上游已响应（上传+生成 ${endStage("上传+生成", reqStart)}s）`, "muted");
            bodyStart = beginStage();
          } else if (phase === "body" && bodyStart) {
            log(`响应体接收 ${endStage("接收响应", bodyStart)}s`, "muted");
          }
        });
        progress.stopWait();
        resultBase64 = await extractAgtokenBase64(data, canvasHeaders(readBridge()), canvasBase);
      } else if (canvasBase && model.apimart) {
        log("画布通道 · APIMart（模型 " + els.model.value + "，带真实进度）…", "muted");
        resultBase64 = await generateViaCanvasApimart(canvasBase, model, { prompt: finalPrompt, n: 1, images: [imageDataUrl] }, readBridge(), pct => {
          progress.set(8 + Math.min(99, pct) * 0.86, "APIMart 生成中 " + pct + "%");
        });
        progress.set(95, "接收结果…");
      } else if (canvasBase) {
        throw new Error("模型配置错误：既不支持 agtoken 也不支持 APIMart");
      } else {
        if (!model.agtoken) throw new Error("该模型仅画布的 APIMart 通道提供：请先启动画布（桌面版或 node server.js）");
        const apiKey = els.apiKey.value.trim();
        if (!apiKey) throw new Error("画布未运行，直连模式需要 agtoken API Key");
        log("直连 agtoken /v1/images/edits（模型 " + els.model.value + "，最长 600 秒）…", "muted");
        progress.startWait(8, 84);
        const reqStart = beginStage();
        let bodyStart = 0;
        const data = await postJson(AGTOKEN_EDITS_URL, buildAgtokenPayload(), { "Authorization": "Bearer " + apiKey }, 0, phase => {
          if (phase === "headers") {
            log(`上游已响应（上传+生成 ${endStage("上传+生成", reqStart)}s）`, "muted");
            bodyStart = beginStage();
          } else if (phase === "body" && bodyStart) {
            log(`响应体接收 ${endStage("接收响应", bodyStart)}s`, "muted");
          }
        });
        progress.stopWait();
        resultBase64 = await extractAgtokenBase64(data, {}, "");
      }
      if (!resultBase64) throw new Error("没有拿到结果图数据");

      const resultPath = tempDir + "/" + base + "-result.png";
      writeBase64(resultPath, resultBase64);
      progress.set(97, "回贴到 Photoshop…");
      log("回贴到 Photoshop…", "muted");
      const placeStart = beginStage();
      const placeResult = parseResult(await evalJsx(`CF_placeImage(${JSON.stringify(resultPath)},${hasSelection})`));
      if (!placeResult.ok) throw new Error(translate(placeResult.error));
      const placeSec = endStage("回贴", placeStart);

      log(`完成：结果已作为新图层贴回（结果 ${placeResult.parts[0] || ""}${hasSelection ? "，已按选区剪裁" : ""}，回贴 ${placeSec}s）`, "ok");
      log(summaryLine(), "muted");
      progress.done();
      try { showPreview(resultPath); } catch (e) { /* 预览失败不影响主流程 */ }
    } catch (error) {
      progress.fail();
      log("失败：" + (error && error.message || error), "err");
      if (timings.length) log("已耗时 " + summaryLine(), "muted");
    } finally {
      progress.stopWait();
      setBusy(false);
    }
  }

  async function refreshDocInfo() {
    try {
      const result = parseResult(await evalJsx("CF_docInfo()"));
      els.docLine.textContent = result.ok
        ? `当前文档：${result.parts[0]}　${result.parts[1] || ""}`
        : "PS 已连接（" + translate(result.error) + "）";
    } catch (e) {
      els.docLine.textContent = "未连上 Photoshop：请确认面板是从 PS 的 窗口 > 扩展 打开的";
    }
  }

  function init() {
    populateModels();
    restoreSettings();
    els.apiKey.addEventListener("change", saveSettings);
    els.channel.addEventListener("change", saveSettings);
    els.canvasUrl.addEventListener("change", saveSettings);
    els.selMode.addEventListener("change", () => {
      els.sendMask.disabled = els.selMode.value === "red"; // 红色标记模式不发送 mask 字段
      saveSettings();
    });
    els.model.addEventListener("change", () => { populateQuality(); saveSettings(); });
    els.size.addEventListener("change", saveSettings);
    els.quality.addEventListener("change", saveSettings);
    els.prompt.addEventListener("change", saveSettings);
    els.sendMask.addEventListener("change", saveSettings);
    els.generateBtn.addEventListener("click", generate);
    evalJsx("CF_ping()").then(raw => {
      const result = parseResult(raw);
      if (result.ok) {
        log("已连接 Photoshop " + (result.parts[1] || ""), "ok");
        refreshDocInfo();
      } else {
        throw new Error(result.error);
      }
    }).catch(() => {
      els.docLine.textContent = "未连上 Photoshop：host.jsx 未加载，重启 PS 后重开面板";
    });
  }

  init();
})();
