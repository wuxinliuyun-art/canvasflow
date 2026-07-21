const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const { execSync } = require("child_process");

const root = path.resolve(__dirname);
const dataRoot = typeof process.pkg !== "undefined" ? path.dirname(process.execPath) : path.resolve(__dirname);
const port = Number(process.env.PORT || 5173);
const mime = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
};

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
  let pathname = parsedUrl.pathname;

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
      const { folderName, files } = JSON.parse(body.toString());
      const exportDir = path.join(dataRoot, "export", folderName);
      if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
      for (const file of files) {
        const filePath = path.join(exportDir, file.name);
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

  if (pathname === "/api/open-folder" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { folderPath } = JSON.parse(body.toString());
      const absPath = path.resolve(dataRoot, folderPath);
      if (!fs.existsSync(absPath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "文件夹不存在" }));
        return;
      }
      const { exec } = require("child_process");
      exec(`explorer "${absPath}"`, (err) => {
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

  // Static file serving
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
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
  console.log("  WEBIMAGE 服务器已启动");
  console.log(`  访问地址: http://127.0.0.1:${port}/`);
  console.log("  关闭本窗口即可停止服务器");
  console.log("=".repeat(44));
});

// 关闭窗口时自动结束进程
process.on("SIGINT", () => {
  console.log("\n正在关闭...");
  server.close(() => process.exit(0));
});
