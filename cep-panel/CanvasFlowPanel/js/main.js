// CanvasFlow <-> Photoshop 互传面板：把当前文档（合并或当前图层）导出 PNG，回传画布建图片节点。
// HTTP 一律走面板内置 Node（CEP 的 file:// 源在新内核下 fetch 会被跨源拦截，且不可靠）。
(() => {
  "use strict";

  const cs = new CSInterface();
  const DEFAULT_CANVAS_URL = "http://127.0.0.1:5173";
  // 面板自身版本号，必须与 CSXS/manifest.xml 的 ExtensionBundleVersion 保持一致：
  // 画布设置里显示的“已安装 v甲”与面板右上角显示的“v乙”对照，甲=乙 即双端一致。
  const PANEL_VERSION = "0.3.6";

  const PS_MESSAGES = [
    ["No document is open", "PS 中没有打开的文档"],
    ["Export failed", "导出失败"],
    ["Export layer failed", "导出当前图层失败"],
    ["The active layer is a group", "当前选中的是图层组，请先选中单个图层"],
    ["Cannot create temp folder", "临时目录创建失败"],
  ];

  const $ = id => document.getElementById(id);
  const els = { docLine: $("docLine"), canvasUrl: $("canvasUrl"), sendAllBtn: $("sendAllBtn"), sendLayerBtn: $("sendLayerBtn"), log: $("log"), statusDot: $("statusDot"), sendAllText: $("sendAllText"), canvasDot: $("canvasDot"), panelVersion: $("panelVersion") };

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

  function parseResult(raw) {
    const parts = String(raw || "").split("|");
    if (parts[0] === "ok") return { ok: true, parts: parts.slice(1) };
    if (parts[0] === "err") return { ok: false, error: parts.slice(1).join("|") || "未知错误" };
    return { ok: false, error: "无法解析 PS 返回：" + String(raw || "(空)").slice(0, 120) };
  }

  function nodeModules() {
    try {
      const req = window.nodeRequire || window.require;
      if (typeof req === "function") return { fs: req("fs"), os: req("os"), path: req("path"), http: req("http"), https: req("https") };
    } catch (e) { /* Node 未启用 */ }
    return null;
  }

  function cepFsEncoding(name, fallback) {
    try { return (window.cep && window.cep.fs && window.cep.fs.encoding && window.cep.fs.encoding[name]) || fallback; }
    catch (e) { return fallback; }
  }

  function ensureTempDir() {
    const io = nodeModules();
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
    const io = nodeModules();
    if (io) return io.fs.readFileSync(path).toString("base64");
    const result = window.cep.fs.readFile(path, cepFsEncoding("BASE64", "Base64"));
    if (result.err !== 0) throw new Error("读取文件失败：" + path);
    return result.data;
  }

  function readBridge() {
    const io = nodeModules();
    if (!io || typeof process === "undefined" || !process.env || !process.env.APPDATA) return null;
    try {
      const file = io.path.join(process.env.APPDATA, "CanvasFlowBridge", "bridge.json");
      // 桌面端 .NET 写文件可能带 UTF-8 BOM，JSON.parse 会因 BOM 抛异常，先剥掉
      const data = JSON.parse(io.fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
      return data && Number(data.port) > 0 ? data : null;
    } catch (e) { return null; }
  }

  // 桥的 HttpListener 注册的主机名是 localhost（http.sys 按 Host 头匹配），
  // 用 127.0.0.1 访问会被拒 400 Invalid Hostname，必须用 localhost 并强制 IPv4。
  function bridgeBase(bridge) {
    return "http://localhost:" + bridge.port;
  }

  // Node 原生 HTTP：不受 CEF 跨源策略影响；fetch 仅作兜底
  function rawRequest(url, options = {}) {
    const io = nodeModules();
    if (io) {
      return new Promise((resolve, reject) => {
        let parsed;
        try { parsed = new URL(url); } catch (e) { return reject(new Error("地址无效：" + url)); }
        const isHttps = parsed.protocol === "https:";
        const mod = isHttps ? io.https : io.http;
        const headers = Object.assign({}, options.headers || {});
        if (options.body) headers["Content-Length"] = Buffer.byteLength(options.body);
        const request = mod.request({
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: options.method || "GET",
          headers,
          family: parsed.hostname === "localhost" ? 4 : undefined, // localhost 强制走 IPv4，避免 ::1 解析歧义
        }, response => {
          let data = "";
          response.setEncoding("utf8");
          response.on("data", chunk => { data += chunk; });
          response.on("end", () => resolve({ status: response.statusCode || 0, text: data }));
        });
        request.setTimeout(options.timeoutMs || 8000, () => request.destroy(new Error("请求超时")));
        request.on("error", error => reject(error));
        if (options.body) request.write(options.body);
        request.end();
      });
    }
    return fetch(url, { method: options.method || "GET", headers: options.headers || {}, body: options.body })
      .then(async resp => ({ status: resp.status, text: await resp.text() }));
  }

  async function probeCanvas(baseUrl, bridge) {
    try {
      const headers = bridge && bridge.token ? { "X-CanvasFlow-Bridge": bridge.token } : {};
      const result = await rawRequest(baseUrl.replace(/\/+$/, "") + "/api/ps/pending", { timeoutMs: 2500, headers });
      if (bridge) return result.status > 0 && result.status < 500; // 自己的桥：端口来自发现文件，有应答即可信
      // 陌生地址必须严格验证：pending 接口返回 200 + {data:[...]} 才是真画布（旧版服务/无关服务一律拒绝）
      if (result.status !== 200) return false;
      const data = JSON.parse(result.text);
      return !!(data && Array.isArray(data.data));
    } catch (e) {
      return false;
    }
  }

  async function resolveCanvasBase() {
    const tried = [];
    const candidates = [];
    const manual = store.get("canvasUrl").trim();
    if (manual) candidates.push({ base: manual.replace(/\/+$/, ""), bridge: null });
    const bridge = readBridge();
    if (bridge) candidates.push({ base: bridgeBase(bridge), bridge });
    const others = [{ base: DEFAULT_CANVAS_URL, bridge: null }];
    for (let offset = 1; offset <= 4; offset++) others.push({ base: "http://127.0.0.1:" + (5173 + offset), bridge: null });
    for (const item of others) {
      if (!candidates.some(existing => existing.base === item.base)) candidates.push(item);
    }
    for (const item of candidates) {
      tried.push(item.base);
      if (await probeCanvas(item.base, item.bridge)) return { base: item.base, bridge: item.bridge };
    }
    throw new Error("没有找到可回传的画布（已尝试：" + tried.join("、") + "）。桌面版请重启 CanvasFlow 让桥接重新登记；服务器模式请填最新 node server.js 的地址");
  }

  async function postJson(url, payload, bridge) {
    const headers = { "Content-Type": "application/json" };
    if (bridge && bridge.token) headers["X-CanvasFlow-Bridge"] = bridge.token; // 桌面桥要求令牌
    const result = await rawRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      timeoutMs: 120000,
    });
    let data = null;
    try { data = JSON.parse(result.text); } catch (e) { /* 保留原文进错误 */ }
    if (result.status < 200 || result.status >= 300 || !data) {
      throw new Error("HTTP " + result.status + (result.text ? "：" + result.text.slice(0, 300) : ""));
    }
    if (data.error) throw new Error(data.error.message || data.error.code || "HTTP " + result.status);
    return data;
  }

  async function ensureCanvas() {
    if (cachedCanvas) return cachedCanvas; // 头部指示灯已探明的连接直接复用
    const found = await resolveCanvasBase();
    cachedCanvas = found;
    return found;
  }

  // 画布连接指示灯：面板打开后台探测一次，发送失败后重新探测；悬停可看画布地址
  let cachedCanvas = null;
  let canvasProbeSeq = 0;
  async function refreshCanvasDot() {
    const seq = ++canvasProbeSeq;
    els.canvasDot.className = "dot";
    els.canvasDot.title = "正在检测画布连接…";
    try {
      const found = await resolveCanvasBase();
      if (seq !== canvasProbeSeq) return; // 已有更新的探测在跑
      cachedCanvas = found;
      els.canvasDot.className = "dot ok";
      els.canvasDot.title = "画布已连接：" + found.base;
    } catch (error) {
      if (seq !== canvasProbeSeq) return;
      cachedCanvas = null;
      els.canvasDot.className = "dot err";
      els.canvasDot.title = "未找到画布。" + (error.message || "");
    }
  }

  let currentDocName = "";

  async function sendToCanvas(kind) {
    setBusy(true);
    els.log.innerHTML = "";
    try {
      const { base: canvasBase, bridge } = await ensureCanvas();

      const tempDir = ensureTempDir();
      const base = "cf-" + Date.now();
      log(kind === "layer" ? "导出当前图层…" : "合并导出当前文档…", "muted");
      const expression = kind === "layer"
        ? `CF_exportLayer(${JSON.stringify(tempDir)},${JSON.stringify(base)})`
        : `CF_exportMerged(${JSON.stringify(tempDir)},${JSON.stringify(base)})`;
      const result = parseResult(await evalJsx(expression));
      if (!result.ok) throw new Error(translate(result.error));
      const imagePath = result.parts[0];
      log("已导出 " + (result.parts[1] || "") + (kind === "layer" && result.parts[3] ? "（图层：" + result.parts[3] + "）" : ""), "muted");

      const docName = (currentDocName || "photoshop").replace(/[\\/:*?"<>|]/g, "_").replace(/\.[^.]*$/, "");
      const suffix = kind === "layer" ? "_layer" : "";
      const fileName = `ps_${docName}${suffix}_${Date.now()}.png`;
      await postJson(canvasBase + "/api/ps/return-image", {
        name: fileName,
        data: "data:image/png;base64," + readBase64(imagePath),
      }, bridge);
      log("完成：画布已添加图片节点（" + fileName + "）", "ok");
    } catch (error) {
      log("失败：" + (error && error.message || error), "err");
      if (String(error && error.message || "").indexOf("没有找到可回传的画布") >= 0) {
        document.body.classList.add("show-field"); // 展开画布地址输入，引导手动填写
        els.canvasUrl.focus();
      }
      refreshCanvasDot(); // 发送失败后重探一次，保持指示灯真实
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy) {
    els.sendAllBtn.disabled = busy;
    els.sendLayerBtn.disabled = busy;
    els.sendAllText.textContent = busy ? "回传中…" : "合并图层 → 画布";
  }

  async function refreshDocInfo() {
    try {
      const result = parseResult(await evalJsx("CF_docInfo()"));
      if (result.ok) {
        currentDocName = result.parts[0] || "";
        els.docLine.textContent = `当前文档：${result.parts[0]}　${result.parts[1] || ""}`;
      } else {
        els.docLine.textContent = "PS 已连接（" + translate(result.error) + "）";
      }
    } catch (e) {
      els.docLine.textContent = "未连上 Photoshop：请确认面板是从 PS 的 窗口 > 扩展 打开的";
    }
  }

  function init() {
    els.panelVersion.textContent = "v" + PANEL_VERSION;
    els.canvasUrl.value = store.get("canvasUrl");
    els.canvasUrl.addEventListener("change", () => {
      store.set("canvasUrl", els.canvasUrl.value.trim());
      refreshCanvasDot(); // 手动改地址后立即重探
    });
    els.sendAllBtn.addEventListener("click", () => sendToCanvas("merged"));
    els.sendLayerBtn.addEventListener("click", () => sendToCanvas("layer"));
    evalJsx("CF_ping()").then(raw => {
      const result = parseResult(raw);
      if (result.ok) {
        log("已连接 Photoshop " + (result.parts[1] || ""), "ok");
        els.statusDot.className = "dot ok";
        refreshDocInfo();
      } else {
        throw new Error(result.error);
      }
    }).catch(() => {
      els.statusDot.className = "dot err";
      els.docLine.textContent = "未连上 Photoshop：重启 PS 后重开面板";
    });
    refreshCanvasDot();
  }

  init();
})();
