const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = __dirname;
const dataRoot = typeof process.pkg !== "undefined" ? path.dirname(process.execPath) : path.resolve(__dirname);
const port = Number(process.env.PORT || 5173);
const mime = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
};

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
        const filePath = path.join(exportDir, path.basename(file.name));
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
    const pickerScript = "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='选择 CanvasFlow 导出文件夹'; $d.ShowNewFolderButton=$true; if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output $d.SelectedPath}";
    execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", pickerScript], { encoding: "utf8", windowsHide: true }, (err, stdout) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "无法打开文件夹选择窗口" }));
        return;
      }
      const folderPath = String(stdout || "").trim();
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
      execFile("explorer.exe", [absPath], { windowsHide: true }, (err) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "无法打开文件夹" }));
        } else {
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
  console.log("=".repeat(44));
  console.log("  CanvasFlow 服务器已启动");
  console.log(`  访问地址: http://127.0.0.1:${port}/`);
  console.log("  关闭本窗口即可停止服务器");
  console.log("=".repeat(44));
});

// 关闭窗口时自动结束进程
process.on("SIGINT", () => {
  console.log("\n正在关闭...");
  server.close(() => process.exit(0));
});
