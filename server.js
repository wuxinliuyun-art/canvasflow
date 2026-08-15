const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const packageInfo = require("./package.json");

const root = __dirname;
let dataRoot = root;
let secretProvider = () => "";
const APP_VERSION = packageInfo.version;
const RELEASES_API = "https://api.github.com/repos/wuxinliuyun-art/canvasflow/releases/latest";
const RELEASES_LATEST = "https://github.com/wuxinliuyun-art/canvasflow/releases/latest";
let releaseCache = null;
let releaseCacheAt = 0;
const mime = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
};

const exportBrowseRoots = new Map();
function configuredExportRoot(folderPath) {
  return folderPath && folderPath !== "export"
    ? (path.isAbsolute(folderPath) ? path.normalize(folderPath) : path.resolve(dataRoot, folderPath))
    : path.join(dataRoot, "export");
}
function htmlEscape(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

var configPath = path.join(dataRoot, "data", "config.json");
function configureRuntime(options = {}) {
  dataRoot = path.resolve(options.dataRoot || root);
  configPath = path.join(dataRoot, "data", "config.json");
  secretProvider = typeof options.getApiKey === "function" ? options.getApiKey : () => "";
  for (const folder of ["data", "download", "export"]) fs.mkdirSync(path.join(dataRoot, folder), { recursive: true });
}

function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf-8");
  try { fs.renameSync(tempPath, filePath); }
  catch (error) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    fs.renameSync(tempPath, filePath);
  }
}

function readJsonFile(filePath, fallback = {}) {
  try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : fallback; }
  catch (error) { console.warn(`[Data] cannot read ${filePath}: ${error.message}`); return fallback; }
}
function loadConfig() {
  try { return fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf-8")) : {}; } catch (e) { return {}; }
}
function saveConfig(config) {
  atomicWriteFile(configPath, JSON.stringify(config, null, 2));
}
function exportBrowseTarget(token, relativePath = "") {
  const session = exportBrowseRoots.get(token);
  if (!session || session.expires < Date.now()) { exportBrowseRoots.delete(token); return null; }
  const normalized = String(relativePath || "").replace(/\\/g, "/").split("/").filter(part => part && part !== ".");
  if (normalized.includes("..")) return null;
  const target = path.resolve(session.root, ...normalized);
  const rootPath = path.resolve(session.root);
  if (target !== rootPath && !target.startsWith(rootPath + path.sep)) return null;
  if (fs.existsSync(target)) {
    const realTarget = fs.realpathSync(target);
    if (realTarget !== rootPath && !realTarget.startsWith(rootPath + path.sep)) return null;
    return { session, target: realTarget, relative: normalized.join("/") };
  }
  return { session, target, relative: normalized.join("/") };
}

var staticCache = {};
(function() {
  var files = ["index.html", "canvas-runtime.js", "app.js", "styles.css"];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    try {
      var filePath = __dirname + "/" + f;
      staticCache["/" + f] = fs.readFileSync(filePath, "utf-8");
    } catch(e) {
      console.log("[Static] cannot load " + f + ": " + e.message + ", path=" + __dirname);
    }
  }
  console.log("[Static] preloaded " + Object.keys(staticCache).length + "/" + files.length + " files");
})();

const API_BASE_URLS = [
  "https://api.apib.ai",
  "https://api.aiuxu.com",
  "https://api.aishuch.com",
  "https://api.apimart.ai",
];

// --- 自动清理旧进程（解决启动闪退 / 端口占用） ---
function readBody(req, maxBytes = 128 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let rejected = false;
    req.on("data", chunk => {
      if (rejected) return;
      total += chunk.length;
      if (total > maxBytes) {
        rejected = true;
        chunks.length = 0;
        reject(new Error(`请求内容超过限制（最大 ${Math.round(maxBytes / 1024 / 1024)}MB）`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

function githubRequest(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error("下载重定向次数过多")); return; }
    const request = https.get(url, {
      headers: {
        "User-Agent": `CanvasFlow/${APP_VERSION}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      timeout: 20000,
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        githubRequest(new URL(response.headers.location, url).toString(), redirects + 1).then(resolve, reject);
        return;
      }
      resolve(response);
    });
    request.on("timeout", () => request.destroy(new Error("连接 GitHub 超时")));
    request.on("error", reject);
  });
}

async function githubJson(url) {
  const response = await githubRequest(url);
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf-8");
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`GitHub 返回 HTTP ${response.statusCode}`);
  return JSON.parse(text);
}

function versionParts(value) {
  return String(value || "").replace(/^v/i, "").split(/[.-]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate, current) {
  const next = versionParts(candidate);
  const now = versionParts(current);
  for (let i = 0; i < 3; i++) {
    if (next[i] !== now[i]) return next[i] > now[i];
  }
  return false;
}

async function latestReleaseInfo() {
  if (releaseCache && Date.now() - releaseCacheAt < 10 * 60 * 1000) return releaseCache;
  let info;
  try {
    const release = await githubJson(RELEASES_API);
    const setupAssets = (release.assets || []).filter(asset => /^CanvasFlow-Setup\.exe$/i.test(asset.name));
    if (setupAssets.length !== 1) throw new Error(`最新 Release 应包含且只包含一个 CanvasFlow-Setup.exe，当前检测到 ${setupAssets.length} 个`);
    const asset = setupAssets[0];
    info = {
      latestVersion: String(release.tag_name || release.name || "").replace(/^v/i, ""),
      releaseName: release.name || release.tag_name,
      notes: release.body || "",
      pageUrl: release.html_url,
      asset: { name: asset.name, size: asset.size, url: asset.browser_download_url, digest: asset.digest || "" },
    };
  } catch (apiError) {
    console.warn("[Update] GitHub API unavailable, using public release page", { message: apiError.message });
    const response = await new Promise((resolve, reject) => {
      const request = https.get(RELEASES_LATEST, { headers: { "User-Agent": `CanvasFlow/${APP_VERSION}` }, timeout: 20000 }, resolve);
      request.on("timeout", () => request.destroy(new Error("连接 GitHub 超时")));
      request.on("error", reject);
    });
    const location = response.headers.location || "";
    response.resume();
    const match = location.match(/\/releases\/tag\/([^/?#]+)/i);
    if (!match) throw apiError;
    const tag = decodeURIComponent(match[1]);
    info = {
      latestVersion: tag.replace(/^v/i, ""), releaseName: tag, notes: "", pageUrl: new URL(location, RELEASES_LATEST).toString(),
      asset: { name: "CanvasFlow-Setup.exe", size: 0, digest: "", url: `https://github.com/wuxinliuyun-art/canvasflow/releases/download/${encodeURIComponent(tag)}/CanvasFlow-Setup.exe` },
    };
  }
  releaseCache = {
    currentVersion: APP_VERSION,
    ...info,
    hasUpdate: isNewerVersion(info.latestVersion, APP_VERSION),
    canAutoInstall: !!(info.asset && info.asset.digest),
  };
  releaseCacheAt = Date.now();
  return releaseCache;
}

function proxyRequest(method, targetUrl, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const options = {
      method,
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      port: 443,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const proxyReq = https.request(options, proxyRes => {
      const chunks = [];
      proxyRes.on("data", chunk => chunks.push(chunk));
      proxyRes.on("end", () => {
        const data = Buffer.concat(chunks);
        resolve({ status: proxyRes.statusCode, headers: proxyRes.headers, body: data });
      });
    });

    proxyReq.on("error", reject);
    proxyReq.setTimeout(120000, () => { proxyReq.destroy(); reject(new Error("timeout")); });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
}

async function tryProxyRequest(method, pathStr, headers, body) {
  let lastError = null;
  let lastRetryableResult = null;
  for (const baseUrl of API_BASE_URLS) {
    try {
      const result = await proxyRequest(method, baseUrl + pathStr, headers, body);
      console.log(`[Proxy] ${baseUrl}${pathStr} -> ${result.status}`);
      if ([500, 502, 503, 504].includes(result.status)) {
        lastRetryableResult = result;
        console.log(`[Proxy] ${baseUrl}${pathStr} returned ${result.status}, trying next...`);
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      console.log(`[Proxy] ${baseUrl}${pathStr} failed: ${err.message}, trying next...`);
    }
  }
  if (lastRetryableResult) return lastRetryableResult;
  throw lastError || new Error("所有 API 地址均不可达");
}

async function requestHandler(req, res) {
  const host = String(req.headers.host || "");
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
    res.writeHead(403, { "Content-Type": "text/plain;charset=utf-8" });
    res.end("Forbidden host");
    return;
  }
  const origin = String(req.headers.origin || "");
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (!/^(127\.0\.0\.1|localhost)$/i.test(parsedOrigin.hostname) || parsedOrigin.host !== host) throw new Error("cross origin");
    } catch {
      res.writeHead(403, { "Content-Type": "text/plain;charset=utf-8" });
      res.end("Cross-origin request denied");
      return;
    }
  }
  const parsedUrl = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(parsedUrl.pathname);
  const requestApiKey = () => String(req.headers["x-canvasflow-api-key"] || parsedUrl.searchParams.get("apiKey") || secretProvider() || "");

  if (pathname === "/api/runtime-paths" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ dataRoot, exportFolder: path.join(dataRoot, "export") }));
    return;
  }

  if (pathname === "/api/app-state" && req.method === "GET") {
    const state = readJsonFile(path.join(dataRoot, "data", "app-state.json"), null);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ state }));
    return;
  }

  if (pathname === "/api/app-state" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
      if (!body || !Array.isArray(body.pages)) throw new Error("项目状态格式无效");
      for (const page of body.pages) if (page && page.data && page.data.settings) page.data.settings.apiKey = "";
      atomicWriteFile(path.join(dataRoot, "data", "app-state.json"), JSON.stringify(body, null, 2));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // screenshot settings API removed

  if (pathname === "/api/config" && req.method === "GET") {
    try {
      var config = loadConfig();
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(config));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json;charset=utf-8" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/config" && req.method === "POST") {
    try {
      var body = JSON.parse((await readBody(req)).toString("utf-8"));
      var config = loadConfig();
      if (typeof body.autoOpenBrowser === "boolean") config.autoOpenBrowser = body.autoOpenBrowser;
      saveConfig(config);
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json;charset=utf-8" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/update/check" && req.method === "GET") {
    try {
      const info = await latestReleaseInfo();
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(info));
    } catch (err) {
      console.error("[Update] check failed", { message: err.message });
      res.writeHead(502, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: `无法检查更新：${err.message}` }));
    }
    return;
  }

  if (pathname === "/api/export-browser" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf-8"));
      const exportRoot = configuredExportRoot(String(body.folderPath || "export"));
      if (!fs.existsSync(exportRoot)) fs.mkdirSync(exportRoot, { recursive: true });
      const realRoot = fs.realpathSync(exportRoot);
      const token = crypto.randomBytes(18).toString("hex");
      const now = Date.now();
      for (const [key, value] of exportBrowseRoots) if (value.expires < now) exportBrowseRoots.delete(key);
      exportBrowseRoots.set(token, { root: realRoot, label: exportRoot, expires: now + 15 * 60 * 1000 });
      console.log(`[Export] authorized: ${realRoot}`);
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ success: true, url: `/export-browser?token=${token}` }));
    } catch (err) {
      console.error("[Export] create token failed", err);
      res.writeHead(500, { "Content-Type": "application/json;charset=utf-8" });
      res.end(JSON.stringify({ error: `无法查看导出目录：${err.message}` }));
    }
    return;
  }

  if (pathname === "/export-browser" && req.method === "GET") {
    const token = parsedUrl.searchParams.get("token") || "";
    const info = exportBrowseTarget(token, parsedUrl.searchParams.get("path") || "");
    if (!info || !fs.existsSync(info.target) || !fs.statSync(info.target).isDirectory()) {
      res.writeHead(403, { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" });
      res.end("<!doctype html><meta charset='utf-8'><title>无法查看</title><p>访问已过期或目录不存在，请返回 CanvasFlow 重新打开。</p>");
      return;
    }
    const entries = fs.readdirSync(info.target, { withFileTypes: true }).sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, "zh-CN"));
    const parent = info.relative.split("/").slice(0, -1).join("/");
    const rows = entries.map(entry => {
      const relative = [info.relative, entry.name].filter(Boolean).join("/");
      const query = `token=${encodeURIComponent(token)}&path=${encodeURIComponent(relative)}`;
      if (entry.isDirectory()) return `<a class="item folder" href="/export-browser?${query}"><span class="icon">📁</span><span>${htmlEscape(entry.name)}</span></a>`;
      const ext = path.extname(entry.name).toLowerCase();
      const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext);
      const preview = isImage ? `<img src="/api/export-browser-file?${query}" alt="">` : `<span class="icon">📄</span>`;
      return `<a class="item file" href="/api/export-browser-file?${query}" target="_blank" rel="noopener">${preview}<span>${htmlEscape(entry.name)}</span></a>`;
    }).join("");
    const upLink = info.relative ? `<a class="up" href="/export-browser?token=${encodeURIComponent(token)}&path=${encodeURIComponent(parent)}">← 返回上级</a>` : "";
    const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CanvasFlow 导出文件</title><style>body{margin:0;padding:28px;font:14px system-ui,-apple-system,"Segoe UI",sans-serif;background:#f5f7fb;color:#172033}main{max-width:1100px;margin:auto}header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px}h1{margin:0 0 5px;font-size:24px}p{margin:0;color:#667085;word-break:break-all}.up{color:#3467eb;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}.item{min-height:112px;padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:1px solid #e3e7ef;border-radius:14px;background:#fff;color:#172033;text-decoration:none;box-shadow:0 5px 18px rgba(30,45,70,.05);overflow:hidden}.item:hover{border-color:#7aa2ff;transform:translateY(-1px)}.item img{width:100%;height:92px;object-fit:contain;border-radius:8px;background:#f4f5f7}.item span:last-child{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.icon{font-size:38px}.empty{padding:50px;text-align:center;color:#98a2b3;background:#fff;border-radius:14px}@media(max-width:600px){body{padding:16px}header{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style></head><body><main><header><div><h1>CanvasFlow 导出文件</h1><p>${htmlEscape(info.session.label)}${info.relative ? ` / ${htmlEscape(info.relative)}` : ""}</p></div>${upLink}</header>${rows ? `<div class="grid">${rows}</div>` : '<div class="empty">此文件夹暂无内容</div>'}</main></body></html>`;
    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(page);
    return;
  }

  if (pathname === "/api/export-browser-file" && req.method === "GET") {
    const info = exportBrowseTarget(parsedUrl.searchParams.get("token") || "", parsedUrl.searchParams.get("path") || "");
    if (!info || !fs.existsSync(info.target) || !fs.statSync(info.target).isFile()) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(info.target).toLowerCase();
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream", "Content-Length": fs.statSync(info.target).size, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(info.target).pipe(res);
    return;
  }

  if (pathname === "/api/custom-library" && req.method === "GET") {
    try {
      const libraryPath = path.join(dataRoot, "data", "custom-library.json");
      const content = fs.existsSync(libraryPath) ? fs.readFileSync(libraryPath, "utf-8") : '{"textTemplates":[],"imageMaterials":[],"builtinDefaultsInitialized":false}';
      JSON.parse(content);
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8" });
      res.end(content);
    } catch (err) {
      console.error("[Library] read failed", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/custom-library" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const library = JSON.parse(body.toString("utf-8"));
      if (!Array.isArray(library.textTemplates) || !Array.isArray(library.imageMaterials)) throw new Error("素材库格式不正确");
      const dataDir = path.join(dataRoot, "data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const libraryPath = path.join(dataDir, "custom-library.json");
      const tempPath = libraryPath + ".tmp";
      fs.writeFileSync(tempPath, JSON.stringify(library, null, 2), "utf-8");
      fs.copyFileSync(tempPath, libraryPath);
      fs.unlinkSync(tempPath);
      console.log(`[Library] saved: texts=${library.textTemplates.length} images=${library.imageMaterials.length}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("[Library] write failed", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API proxy routes
  if (pathname === "/api/save-json" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { name, content } = JSON.parse(body.toString());
      const fileName = path.basename(String(name || ""));
      if (!fileName || !fileName.toLowerCase().endsWith(".json") || fileName !== String(name || "")) throw new Error("JSON文件名不安全");
      const downloadDir = path.join(dataRoot, "download");
      if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
      const filePath = path.join(downloadDir, fileName);
      fs.writeFileSync(filePath, content, "utf-8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, path: filePath }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/auto-backup" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf-8"));
      const name = path.basename(String(body.name || ""));
      const content = String(body.content || "");
      if (!name || name.length > 100 || !name.toLowerCase().endsWith(".json") || /[<>:"/\\|?*\x00-\x1f]/.test(name)) {
        throw new Error("自动备份文件名格式不正确");
      }
      if (!content) throw new Error("自动备份内容为空");
      JSON.parse(content);
      const backupDir = path.join(dataRoot, "download", "自动备份");
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const filePath = path.join(backupDir, name);
      const tempPath = path.join(backupDir, `.${name}.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(tempPath, content, "utf-8");
      try {
        fs.copyFileSync(tempPath, filePath);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
      console.info("[AutoBackup] written", { file: filePath, bytes: Buffer.byteLength(content, "utf-8") });
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ success: true, path: filePath }));
    } catch (err) {
      console.error("[AutoBackup] write failed", { message: err.message });
      res.writeHead(400, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: `自动备份失败：${err.message}` }));
    }
    return;
  }

  if (pathname === "/api/save-export-files" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { folderName, baseFolder, files } = JSON.parse(body.toString());
      const configuredRoot = baseFolder && baseFolder !== "export" ? (path.isAbsolute(baseFolder) ? path.normalize(baseFolder) : path.resolve(dataRoot, baseFolder)) : path.join(dataRoot, "export");
      const exportDir = path.join(configuredRoot, path.basename(folderName));
      if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
      const savedFiles = [];
      for (const file of files) {
        const parts = String(file.name || "").replace(/\\/g, "/").split("/").filter(part => part && part !== ".");
        if (!parts.length || parts.includes("..")) throw new Error("导出文件路径不安全");
        const filePath = path.resolve(exportDir, ...parts);
        const exportPrefix = path.resolve(exportDir) + path.sep;
        if (!filePath.startsWith(exportPrefix)) throw new Error("导出文件超出目标目录");
        const parentDir = path.dirname(filePath);
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
        const buf = Buffer.from(file.data.split(",")[1] || file.data, "base64");
        fs.writeFileSync(filePath, buf);
        savedFiles.push(filePath);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, path: exportDir, files: savedFiles }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/download-image" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { imageUrl } = JSON.parse(body.toString());
      const result = await proxyRequest("GET", imageUrl, {});
      const contentType = result.headers?.["content-type"] || "image/png";
      const base64 = "data:" + contentType + ";base64," + result.body.toString("base64");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ base64 }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/generate" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body.toString());
      const apiKey = payload._apiKey || secretProvider() || "";
      delete payload._apiKey;

      const { status, body: resBody } = await tryProxyRequest(
        "POST",
        "/v1/images/generations",
        { Authorization: `Bearer ${apiKey}` },
        JSON.stringify(payload)
      );

      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(resBody);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 502, message: "代理请求失败: " + err.message } }));
    }
    return;
  }

  if (pathname === "/api/verify" && req.method === "GET") {
    try {
      const apiKey = requestApiKey();
      const { status } = await tryProxyRequest(
        "GET",
        "/v1/tasks/verify_test_nonexistent",
        { Authorization: `Bearer ${apiKey}` }
      );
      if (status === 401 || status === 403) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ valid: false, message: "API Key 无效" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ valid: true, message: "API Key 有效" }));
      }
    } catch (err) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ valid: false, message: "验证失败: " + err.message }));
    }
    return;
  }

  if (pathname.startsWith("/api/task/") && req.method === "GET") {
    try {
      const taskId = pathname.replace("/api/task/", "");
      const apiKey = requestApiKey();

      const { status, body: resBody } = await tryProxyRequest(
        "GET",
        `/v1/tasks/${taskId}`,
        { Authorization: `Bearer ${apiKey}` }
      );

      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(resBody);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 502, message: "代理请求失败: " + err.message } }));
    }
    return;
  }

  if (pathname === "/api/models" && req.method === "GET") {
    try {
      const apiKey = requestApiKey();
      const { status, body: resBody } = await tryProxyRequest(
        "GET",
        "/v1/models",
        { Authorization: `Bearer ${apiKey}` }
      );
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(resBody);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 502, message: "代理请求失败: " + err.message } }));
    }
    return;
  }

  if (pathname === "/api/balance" && req.method === "GET") {
    try {
      const apiKey = requestApiKey();
      const { status, body: resBody } = await tryProxyRequest(
        "GET",
        "/v1/balance",
        { Authorization: `Bearer ${apiKey}` }
      );
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(resBody);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 502, message: "代理请求失败: " + err.message } }));
    }
    return;
  }

  if (pathname === "/api/save-images" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { files } = JSON.parse(body.toString());
      const imagesDir = path.join(dataRoot, "download", "images");
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      const results = [];
      for (const file of files) {
        const filePath = path.join(imagesDir, path.basename(file.name));
        const buf = Buffer.from(file.data, "base64");
        fs.writeFileSync(filePath, buf);
        results.push({ name: file.name, saved: true });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, files: results }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/custom-material" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { name, data } = JSON.parse(body.toString());
      const imagesDir = path.join(dataRoot, "download", "images");
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      const ext = (name.match(/\.(\w+)$/) || [])[1] || "png";
      const safeName = name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5\.]/g, "_");
      const fileName = `custom_${Date.now()}_${safeName}`;
      const filePath = path.join(imagesDir, fileName);
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(filePath, buf);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, fileName }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/custom-material" && req.method === "DELETE") {
    try {
      const body = await readBody(req);
      const { fileName } = JSON.parse(body.toString());
      const filePath = path.join(dataRoot, "download", "images", fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static file serving (优先内存缓存)
  if (pathname === "/") pathname = "/index.html";
  console.log(`[Static] root=${root}, pathname=${pathname}`);
  if (staticCache[pathname]) {
    var ext = path.extname(pathname);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(staticCache[pathname]);
    return;
  }
  // 回退到磁盘读取（download/images 等非缓存文件）
  var relPath = pathname.replace(/^\//, "");
  var file = path.join(root, relPath);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  console.log(`[Static] try root: ${file}`);
  fs.readFile(file, (err, data) => {
    if (err) {
      console.log(`[Static] root miss, trying dataRoot`);
      // 如果在 root 下没找到，尝试 dataRoot（自定义素材等文件保存在 exe 所在目录）
      var altFile = path.join(dataRoot, relPath);
      if (altFile !== dataRoot && altFile !== file && altFile.startsWith(dataRoot + path.sep)) {
        fs.readFile(altFile, (err2, data2) => {
          if (err2) {
            console.log(`[Static] dataRoot read error: ${err2.code} ${err2.message}, altFile=${altFile}`);
            res.writeHead(404);
            res.end("Not found");
            return;
          }
          console.log(`[Static] dataRoot hit: ${altFile}`);
          const ext2 = path.extname(altFile);
          res.writeHead(200, { "Content-Type": mime[ext2] || "application/octet-stream" });
          res.end(data2);
        });
        return;
      }
      console.log(`[Static] dataRoot prefix failed, altFile=${altFile}, dataRoot=${dataRoot}`);
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    console.log(`[Static] root hit: ${file}`);
    const ext = path.extname(file);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function startCanvasFlowServer(options = {}) {
  configureRuntime(options);
  const server = http.createServer(requestHandler);
  const requestedPort = Number(options.port || process.env.PORT || 5173);
  return new Promise((resolve, reject) => {
    const tryListen = (candidate, attempts = 0) => {
      const onError = error => {
        server.removeListener("listening", onListening);
        if (error.code === "EADDRINUSE" && attempts < 20) {
          console.warn(`[Start] port ${candidate} in use, switching to ${candidate + 1}`);
          setTimeout(() => tryListen(candidate + 1, attempts + 1), 100);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        const address = server.address();
        const activePort = address && typeof address === "object" ? address.port : candidate;
        const url = `http://127.0.0.1:${activePort}/`;
        console.log(`[Start] CanvasFlow server: ${url}`);
        resolve({ server, port: activePort, url, dataRoot, close: () => new Promise(done => server.close(done)) });
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate, "127.0.0.1");
    };
    tryListen(requestedPort);
  });
}

module.exports = { startCanvasFlowServer, latestReleaseInfo, APP_VERSION };

if (require.main === module) {
  startCanvasFlowServer({ dataRoot: root }).then(instance => {
    console.log(`CanvasFlow source mode: ${instance.url}`);
    process.on("SIGINT", () => instance.close().then(() => process.exit(0)));
  }).catch(error => {
    console.error("Server start failed:", error.message);
    process.exitCode = 1;
  });
}
