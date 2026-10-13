// 内置扩展服务：把 Windows 桌面版 DesktopApi 的拓展职责移植到 Node 侧。
// 调用约定与《拓展脚本规范》一致：清空 input/ 写入图片 → 以拓展目录为工作目录
// 运行入口脚本 → 收集 output/。前端经 canvasflowDesktop.apiRequest 调用，
// 路由：GET /api/extensions、POST /api/extensions/refresh、POST /api/extensions/{id}/run。
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const IMAGE_MIME_EXT = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

let extensionsFolder = "";

function init({ appRoot, isPackaged }) {
  // 打包版：拓展文件夹放用户可见可写的位置（.app 包内只读，且 Gatekeeper 会迁移路径）；
  // 源码运行：与 Windows 桌面版一致，用项目目录旁的 拓展/（便于共用同一批工具调试）。
  extensionsFolder = isPackaged
    ? path.join(os.homedir(), "Documents", "CanvasFlow拓展")
    : path.join(path.dirname(path.resolve(appRoot)), "拓展");
  fs.mkdirSync(extensionsFolder, { recursive: true });
  const readme = path.join(extensionsFolder, "把拓展工具放这里.txt");
  if (!fs.existsSync(readme)) {
    try {
      fs.writeFileSync(readme,
        "每个拓展一个文件夹，内含 扩展.json 清单和入口脚本（规范见 CanvasFlow 的《拓展脚本规范》）。\n" +
        "放入后重启 CanvasFlow，或在画布「拓展」页点击刷新。\n");
    } catch (_) { /* 只读等场景忽略 */ }
  }
  return extensionsFolder;
}

function json(status, payload) {
  return { status, body: JSON.stringify(payload), contentType: "application/json;charset=utf-8" };
}

function safeLeafName(value) {
  const name = String(value ?? "");
  if (!name.trim() || name !== path.win32.basename(name) || /[<>:"|?*\x00-\x1f]/.test(name)) {
    throw new Error("文件名格式不正确");
  }
  return name;
}

function atomicWriteFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function readManifest(directory) {
  const manifestPath = path.join(directory, "扩展.json");
  if (!fs.existsSync(manifestPath)) throw new Error("缺少 扩展.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`扩展.json 解析失败：${error.message}`);
  }
  if (!manifest || typeof manifest !== "object") throw new Error("扩展.json 为空");
  const id = manifest.id != null ? String(manifest.id) : "";
  if (!id.trim()) throw new Error("缺少 id");
  const entry = safeLeafName(manifest.entry != null ? String(manifest.entry) : "");
  if (!fs.existsSync(path.join(directory, entry))) throw new Error(`缺少入口文件 ${entry}`);
  const columns = Number(manifest.columns) === 2 ? 2 : 1;
  const timeout = Number(manifest.timeout) > 0 ? Number(manifest.timeout) : 600;
  return {
    id,
    name: manifest.name != null ? String(manifest.name) : id,
    description: manifest.description != null ? String(manifest.description) : "",
    entry,
    input: manifest.input != null ? String(manifest.input) : "images",
    output: manifest.output != null ? String(manifest.output) : "images",
    params: Array.isArray(manifest.params) ? manifest.params : [],
    columns,
    timeout,
  };
}

function listExtensions() {
  const extensions = [];
  const invalid = [];
  if (fs.existsSync(extensionsFolder)) {
    const dirs = fs.readdirSync(extensionsFolder, { withFileTypes: true })
      .filter(item => item.isDirectory())
      .map(item => path.join(extensionsFolder, item.name))
      .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
    for (const dir of dirs) {
      try { extensions.push(readManifest(dir)); }
      catch (error) {
        const name = path.basename(dir);
        invalid.push({ id: name, name, error: error.message });
      }
    }
  }
  return json(200, { ok: true, extensions, invalid, baseDir: fs.existsSync(extensionsFolder) ? extensionsFolder : "" });
}

function findExtensionDirectory(id) {
  if (!fs.existsSync(extensionsFolder)) return null;
  const dirs = fs.readdirSync(extensionsFolder, { withFileTypes: true })
    .filter(item => item.isDirectory())
    .map(item => path.join(extensionsFolder, item.name));
  for (const dir of dirs) {
    try {
      if (String(readManifest(dir).id).toLowerCase() === String(id).toLowerCase()) return dir;
    } catch (_) { /* 无效拓展目录跳过 */ }
  }
  return null;
}

let pythonCache = null;
function resolvePython() {
  if (pythonCache) return pythonCache;
  const candidates = process.platform === "win32"
    ? [["python", ""], ["python3", ""], ["py", "-3"]]
    : [["python3", ""], ["python", ""]];
  for (const [file, prefix] of candidates) {
    const args = prefix ? prefix.split(" ").filter(Boolean) : [];
    try {
      const probe = spawnSync(file, [...args, "--version"], { encoding: "utf-8", timeout: 15000 });
      if (probe.status === 0) {
        pythonCache = { file, args: prefix ? prefix.split(" ").filter(Boolean) : [] };
        return pythonCache;
      }
    } catch (_) { /* 下一个候选 */ }
  }
  throw new Error("没有找到 Python，请安装 Python 3 并加入 PATH 后重试");
}

function killProcessTree(child) {
  if (!child || child.pid == null || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try { process.kill(-child.pid, "SIGTERM"); }
      catch (_) { child.kill("SIGTERM"); }
    }
  } catch (_) { /* 已退出 */ }
}

function runExtension(pathname, body) {
  const id = decodeURIComponent(pathname.split("/")[3] || "");
  const directory = findExtensionDirectory(id);
  if (!directory) throw new Error(`找不到拓展 ${id}，请刷新拓展列表`);
  const manifest = readManifest(directory);
  const outputMode = manifest.output;
  const timeoutSeconds = manifest.timeout;
  let request;
  try { request = JSON.parse(body || "{}"); }
  catch (_) { throw new Error("JSON格式不正确"); }
  const inputImages = request && Array.isArray(request.images) ? request.images : null;
  if (!inputImages) throw new Error("请求缺少 images");

  const inputDirectory = path.join(directory, "input");
  fs.mkdirSync(inputDirectory, { recursive: true });
  for (const stale of fs.readdirSync(inputDirectory, { withFileTypes: true })) {
    if (stale.isFile()) fs.rmSync(path.join(inputDirectory, stale.name), { force: true });
  }
  for (const image of inputImages) {
    if (!image || typeof image !== "object") continue;
    const name = safeLeafName(image.name);
    if (typeof image.data !== "string") throw new Error(`图片 ${name} 缺少数据`);
    fs.writeFileSync(path.join(inputDirectory, name), Buffer.from(image.data, "base64"));
  }
  atomicWriteFile(path.join(directory, "params.json"), JSON.stringify(request.params && typeof request.params === "object" ? request.params : {}));

  const outputDirectory = path.join(directory, "output");
  fs.rmSync(outputDirectory, { recursive: true, force: true });

  const startedAt = Date.now();
  const python = resolvePython();
  console.log(`[拓展] 运行 ${id}（${inputImages.length} 张输入）`);
  return new Promise((resolve, reject) => {
    const child = spawn(python.file, [...python.args, manifest.entry], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      // posix 下 detached 让负 pid 组终止成为可能；win32 由 taskkill /T 负责进程树
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    const timer = setTimeout(() => {
      settled = true;
      killProcessTree(child);
      reject(new Error(`拓展执行超过 ${timeoutSeconds} 秒，已终止`));
    }, timeoutSeconds * 1000);
    child.on("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动 Python 进程：${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) { reject(new Error("拓展脚本已被终止")); return; }
      if (code !== 0) {
        const detail = stderr.length > 500 ? stderr.slice(-500) : stderr;
        reject(new Error(`拓展脚本失败（退出码 ${code}）：${detail.trim() || stdout.slice(-200)}`));
        return;
      }
      try {
        const images = [];
        const files = [];
        if (fs.existsSync(outputDirectory)) {
          const collected = [];
          (function walk(dir) {
            for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1)) {
              const full = path.join(dir, item.name);
              if (item.isDirectory()) walk(full);
              else if (item.isFile()) collected.push(full);
            }
          })(outputDirectory);
          collected.sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
          for (const file of collected) {
            const payload = {
              name: path.relative(outputDirectory, file).split(path.sep).join("/"),
              data: fs.readFileSync(file).toString("base64"),
            };
            if (String(outputMode).toLowerCase() === "images") images.push(payload);
            else files.push(payload);
          }
        }
        const duration = Math.round((Date.now() - startedAt) / 100) / 10;
        console.log(`[拓展] ${id} 完成：${images.length + files.length} 个输出，用时 ${duration} 秒`);
        resolve(json(200, { ok: true, images, files, duration }));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function dispatch(method, pathname, body) {
  try {
    if (method === "GET" && pathname === "/api/extensions") return Promise.resolve(listExtensions());
    if (method === "POST" && pathname === "/api/extensions/refresh") return Promise.resolve(listExtensions());
    if (method === "POST" && pathname.startsWith("/api/extensions/") && pathname.endsWith("/run")) {
      return runExtension(pathname, body);
    }
    return Promise.resolve(json(404, { error: "拓展接口不存在" }));
  } catch (error) {
    return Promise.resolve(json(500, { error: error.message || String(error) }));
  }
}

module.exports = { init, dispatch, IMAGE_MIME_EXT };
