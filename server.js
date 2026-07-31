const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const root = __dirname;
const dataRoot = typeof process.pkg !== "undefined" ? path.dirname(process.execPath) : path.resolve(__dirname);
const port = Number(process.env.PORT || 5173);
const mime = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
};

const exportBrowseRoots = new Map();
function openDefaultBrowser(url) {
  if (process.env.CANVASFLOW_NO_BROWSER === "1") {
    console.info("[启动] 已跳过自动打开浏览器（测试模式）");
    return;
  }
  if (process.platform !== "win32") {
    console.info(`[启动] 请在浏览器中打开: ${url}`);
    return;
  }
  const { execFile } = require("child_process");
  const encodedUrl = Buffer.from(url, "utf16le").toString("base64");
  const script = `$ErrorActionPreference='Stop'; $u=[System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedUrl}')); Start-Process -FilePath $u`;
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const powershellPath = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  execFile(powershellPath, ["-NoProfile", "-STA", "-EncodedCommand", encodedScript], { encoding: "utf8", windowsHide: true, timeout: 15000 }, err => {
    if (err) console.error("[启动] 自动打开默认浏览器失败", { code: err.code, killed: err.killed, message: err.message });
    else console.info("[启动] 已请求默认浏览器打开", { url });
  });
}

function configuredExportRoot(folderPath) {
  return folderPath && folderPath !== "export"
    ? (path.isAbsolute(folderPath) ? path.normalize(folderPath) : path.resolve(dataRoot, folderPath))
    : path.join(dataRoot, "export");
}
function htmlEscape(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  var files = ["index.html", "app.js", "styles.css"];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    try {
      var filePath = __dirname + "/" + f;
      staticCache["/" + f] = fs.readFileSync(filePath, "utf-8");
    } catch(e) {
      console.log("[静态文件] 无法加载 " + f + ": " + e.message + ", path=" + __dirname);
    }
  }
  console.log("[静态文件] 预加载 " + Object.keys(staticCache).length + "/" + files.length + " 个文件");
})();

const API_BASE_URLS = [
  "https://api.apib.ai",
  "https://api.aiuxu.com",
  "https://api.aishuch.com",
  "https://api.apimart.ai",
];

// --- 自动清理旧进程（解决启动闪退 / 端口占用） ---
function cleanupPort(p) {
  try {
    if (process.platform === "win32") {
      const out = execSync(
        `netstat -ano | findstr ":${p}" | findstr "LISTENING"`,
        { encoding: "utf-8", timeout: 3000, windowsHide: true }
      );
      const lines = out.trim().split(/\r?\n/);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          try {
            execSync(`taskkill /f /pid ${pid}`, { timeout: 3000, windowsHide: true });
            console.log(`[清理] 已终止旧进程 PID:${pid}，释放端口 ${p}`);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
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
  for (const baseUrl of API_BASE_URLS) {
    try {
      const result = await proxyRequest(method, baseUrl + pathStr, headers, body);
      console.log(`[代理] ${baseUrl}${pathStr} -> ${result.status}`);
      return result;
    } catch (err) {
      lastError = err;
      console.log(`[代理] ${baseUrl}${pathStr} 失败: ${err.message}, 尝试下一个...`);
    }
  }
  throw lastError || new Error("所有 API 地址均不可达");
}

async function requestHandler(req, res) {
  const parsedUrl = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === "/api/runtime-paths" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ dataRoot, exportFolder: path.join(dataRoot, "export") }));
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
      console.log(`[导出查看] 已授权目录: ${realRoot}`);
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ success: true, url: `/export-browser?token=${token}` }));
    } catch (err) {
      console.error("[导出查看] 创建访问令牌失败", err);
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
      const content = fs.existsSync(libraryPath) ? fs.readFileSync(libraryPath, "utf-8") : '{"textTemplates":[],"imageMaterials":[]}';
      JSON.parse(content);
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8" });
      res.end(content);
    } catch (err) {
      console.error("[加载] 本地素材库读取失败", err);
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
      console.log(`[保存] 本地素材库：文字=${library.textTemplates.length}，图片=${library.imageMaterials.length}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("[保存] 本地素材库写入失败", err);
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
      const downloadDir = path.join(dataRoot, "download");
      if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
      const filePath = path.join(downloadDir, name);
      fs.writeFileSync(filePath, content, "utf-8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, path: filePath }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
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
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, path: exportDir }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === "/api/choose-folder" && req.method === "POST") {
    if (process.platform !== "win32") {
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "当前系统暂不支持文件夹选择器，请手动输入完整路径" }));
      return;
    }
    const { execFile } = require("child_process");
    const pickerScript = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $owner=New-Object System.Windows.Forms.Form; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Opacity=0; $owner.StartPosition='CenterScreen'; $owner.Show(); $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='选择 CanvasFlow 导出文件夹'; $d.ShowNewFolderButton=$true; try { if($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK){ Write-Output $d.SelectedPath } } finally { $d.Dispose(); $owner.Close(); $owner.Dispose() }";
    const encodedScript = Buffer.from(pickerScript, "utf16le").toString("base64");
    const powershellPath = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    console.info("[导出] 打开文件夹选择窗口");
    execFile(powershellPath, ["-NoProfile", "-STA", "-EncodedCommand", encodedScript], { encoding: "utf8", windowsHide: true, timeout: 300000 }, (err, stdout) => {
      if (err) {
        console.error("[导出] 文件夹选择窗口失败", { code: err.code, killed: err.killed, message: err.message });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "无法打开文件夹选择窗口，可能被安全软件拦截；请直接粘贴完整路径" }));
        return;
      }
      const folderPath = String(stdout || "").trim();
      console.info("[导出] 文件夹选择完成", { selected: Boolean(folderPath) });
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8" });
      res.end(JSON.stringify(folderPath ? { success: true, folderPath } : { success: false, cancelled: true }));
    });
    return;
  }

  if (pathname === "/api/open-folder" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { folderPath } = JSON.parse(body.toString());
      const absPath = path.isAbsolute(folderPath) ? path.normalize(folderPath) : path.resolve(dataRoot, folderPath);
      if (!fs.existsSync(absPath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "文件夹不存在" }));
        return;
      }
      const { execFile } = require("child_process");
      const encodedPath = Buffer.from(absPath, "utf16le").toString("base64");
      const openScript = `$ErrorActionPreference='Stop'; $p=[System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedPath}')); $explorer=Join-Path $env:WINDIR 'explorer.exe'; $quotedPath='"' + $p + '"'; $process=Start-Process -FilePath $explorer -ArgumentList @($quotedPath) -PassThru; if($null -eq $process){ throw '资源管理器进程未创建' }`;
      const encodedScript = Buffer.from(openScript, "utf16le").toString("base64");
      const powershellPath = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      console.info("[导出] 请求打开导出文件夹", { path: absPath });
      execFile(powershellPath, ["-NoProfile", "-STA", "-EncodedCommand", encodedScript], { encoding: "utf8", windowsHide: true, timeout: 15000 }, (err) => {
        if (err) {
          console.error("[导出] 打开导出文件夹失败", { code: err.code, killed: err.killed, message: err.message });
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Windows Shell 未能打开文件夹，可能被安全软件拦截" }));
        } else {
          console.info("[导出] 已提交文件夹打开请求", { path: absPath });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        }
      });
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
      const apiKey = payload._apiKey;
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
      const apiKey = parsedUrl.searchParams.get("apiKey") || "";
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
      const apiKey = parsedUrl.searchParams.get("apiKey") || "";

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
      const apiKey = parsedUrl.searchParams.get("apiKey") || "";
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
      const apiKey = parsedUrl.searchParams.get("apiKey") || "";
      const { status, body: resBody } = await tryProxyRequest(
        "GET",
        "/v1/user/balance",
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
  console.log(`[静态文件] root=${root}, pathname=${pathname}`);
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
  console.log(`[静态文件] 尝试 root: ${file}`);
  fs.readFile(file, (err, data) => {
    if (err) {
      console.log(`[静态文件] root 未命中, 尝试 dataRoot`);
      // 如果在 root 下没找到，尝试 dataRoot（自定义素材等文件保存在 exe 所在目录）
      var altFile = path.join(dataRoot, relPath);
      if (altFile !== dataRoot && altFile !== file && altFile.startsWith(dataRoot + path.sep)) {
        fs.readFile(altFile, (err2, data2) => {
          if (err2) {
            console.log(`[静态文件] dataRoot 读取失败: ${err2.code} ${err2.message}, altFile=${altFile}`);
            res.writeHead(404);
            res.end("Not found");
            return;
          }
          console.log(`[静态文件] dataRoot 命中: ${altFile}`);
          const ext2 = path.extname(altFile);
          res.writeHead(200, { "Content-Type": mime[ext2] || "application/octet-stream" });
          res.end(data2);
        });
        return;
      }
      console.log(`[静态文件] dataRoot 前缀检查失败, altFile=${altFile}, dataRoot=${dataRoot}`);
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    console.log(`[静态文件] root 命中: ${file}`);
    const ext = path.extname(file);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// --- 启动服务器 ---
cleanupPort(port);

const server = http.createServer(requestHandler);
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[错误] 端口 ${port} 被占用，尝试再次清理...`);
    cleanupPort(port);
    setTimeout(() => {
      server.listen(port, "127.0.0.1");
    }, 500);
    return;
  }
  console.error("服务器错误:", err.message);
});

server.listen(port, "127.0.0.1", () => {
  const appUrl = `http://127.0.0.1:${port}/`;
  console.log("=".repeat(44));
  console.log("  CanvasFlow 服务器已启动");
  console.log(`  访问地址: ${appUrl}`);
  console.log("  关闭本窗口即可停止服务器");
  console.log("=".repeat(44));
  openDefaultBrowser(appUrl);
});

// 关闭窗口时自动结束进程
process.on("SIGINT", () => {
  console.log("\n正在关闭...");
  server.close(() => process.exit(0));
});
