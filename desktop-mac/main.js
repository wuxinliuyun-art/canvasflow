// CanvasFlow macOS 桌面壳（Electron）。
// 架构与 Windows 版对齐：内嵌 server.js 提供静态资源与 /api/*，
// preload 注入 window.canvasflowDesktop（与 WebView2 版同名同形），
// 前端文件零改动即可运行在"桌面模式"。截图暂不提供；PS 互传、界面热更新已提供
// （热更新与 Windows 版消费同一份 Release 资产 CanvasFlow-Web.zip，见 web-update.js）。
const { app, BrowserWindow, Menu, ipcMain, shell, clipboard, nativeImage, dialog, session, safeStorage } = require("electron");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { startCanvasFlowServer, APP_VERSION } = require("./server.js");
const extensionService = require("./extension-service.js");
const assetStore = require("./asset-store.js");
const psInterop = require("./ps-interop.js");
const webUpdate = require("./web-update.js");

app.setName("CanvasFlow");

const isDev = !app.isPackaged;
const isMac = process.platform === "darwin";
// 数据根：源码运行=项目目录（与 Windows 源码版一致）；打包版=用户数据目录（.app 包内只读）。
const dataRoot = process.env.CANVASFLOW_DATA_ROOT
  ? path.resolve(process.env.CANVASFLOW_DATA_ROOT)
  : isDev ? __dirname : app.getPath("userData");

let serverPort = 0;
let serverUrl = "";
let serverInstance = null;
const serverInstances = [];
let serverClosed = false;
let mainWindow = null;
let appQuitting = false;
let pendingSaveComplete = null;
let pendingSaveRequestId = "";

// CANVASFLOW_ALLOW_MULTI=1 允许与已运行的实例（如安装版）并行启动，便于源码调试
const gotLock = process.env.CANVASFLOW_ALLOW_MULTI ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  console.error("[CanvasFlow] 已有另一个 CanvasFlow 实例在运行（可能为安装版），本次启动退出；如需并行调试可设 CANVASFLOW_ALLOW_MULTI=1");
  app.quit();
}

// ---------- 通用工具 ----------

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

function json(status, payload) {
  return { status, body: JSON.stringify(payload), contentType: "application/json;charset=utf-8" };
}

// ---------- API Key 安全存储（secrets.json v2 双槽） ----------
// Windows 版用 DPAPI；mac 版用 Electron safeStorage（Keychain）。
// 加密前缀区分两态：safeStorage 密文带 "enc:"，不可用时降级 base64 并提示。

const secretsPath = path.join(dataRoot, "data", "secrets.json");

function readSecretsFile() {
  try {
    if (!fs.existsSync(secretsPath)) return {};
    return JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
  } catch (_) { return {}; }
}

function decryptSlot(encrypted) {
  const value = String(encrypted || "");
  if (!value) return "";
  try {
    if (value.startsWith("enc:")) {
      if (!safeStorage.isEncryptionAvailable()) return "";
      return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
    }
    return Buffer.from(value, "base64").toString("utf-8");
  } catch (_) { return ""; }
}

function encryptSlot(value, warnings) {
  const plain = Buffer.from(value, "utf-8");
  if (safeStorage.isEncryptionAvailable()) {
    // Electron 的 safeStorage.encryptString 只接受 string（传 Buffer 会在参数转换时报错）
    return "enc:" + safeStorage.encryptString(value).toString("base64");
  }
  warnings.push("系统安全存储不可用，API Key 将以未加密形式保存在本地文件中");
  return plain.toString("base64");
}

function readApiKey(apiType) {
  const slot = String(apiType || "apimart").toLowerCase() === "agtoken" ? "agtoken" : "apimart";
  const secrets = readSecretsFile();
  const keys = secrets.keys || {};
  return decryptSlot(keys[slot] || (slot === "apimart" ? secrets.apiKey : ""));
}

function saveApiKey(value, apiType) {
  const slot = String(apiType || "apimart").toLowerCase() === "agtoken" ? "agtoken" : "apimart";
  const warnings = [];
  const keys = {
    apimart: readApiKey("apimart"),
    agtoken: readApiKey("agtoken"),
  };
  keys[slot] = String(value ?? "").trim();
  if (!keys.apimart && !keys.agtoken) {
    try { if (fs.existsSync(secretsPath)) fs.rmSync(secretsPath, { force: true }); } catch (_) {}
    return { success: true };
  }
  const stored = {};
  for (const [name, key] of Object.entries(keys)) {
    if (!key) continue;
    stored[name] = encryptSlot(key, warnings);
  }
  atomicWriteFile(secretsPath, JSON.stringify({ version: 2, keys: stored }, null, 2));
  return warnings.length ? { success: true, warning: warnings.join("；") } : { success: true };
}

// ---------- 桌面 API 路由（对齐 DesktopApi.HandleLocal） ----------

function saveProject(body) {
  const request = JSON.parse(body || "{}");
  const name = safeLeafName(request.name);
  if (!/\.cflow$/i.test(name)) throw new Error("项目文件必须使用 .cflow 后缀");
  const content = String(request.content ?? "");
  const parsed = JSON.parse(content);
  if (parsed.type !== "project" && parsed.type !== "library") throw new Error("CanvasFlow 文件类型不正确");
  const requestedFolder = String(request.folderPath || "").trim();
  const folder = requestedFolder ? path.resolve(requestedFolder) : path.join(dataRoot, "projects");
  fs.mkdirSync(folder, { recursive: true });
  const filePath = path.join(folder, name);
  atomicWriteFile(filePath, content);
  console.log(`[项目保存] 类型=${parsed.type}，路径=${filePath}`);
  return { success: true, path: filePath, type: parsed.type };
}

function forwardToLocalServer(pathAndQuery, method, body, apiKey) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (apiKey) headers["X-CanvasFlow-Api-Key"] = apiKey;
    const req = http.request({ host: "127.0.0.1", port: serverPort, path: pathAndQuery, method, headers }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode || 500,
        body: Buffer.concat(chunks).toString("utf-8"),
        contentType: res.headers["content-type"] || "application/json;charset=utf-8",
      }));
    });
    req.on("error", error => reject(error));
    if (body) req.write(body);
    req.end();
  });
}

async function routeApi(pathAndQuery, method, body, apiKey) {
  const pathname = new URL(pathAndQuery.startsWith("/") ? pathAndQuery : "/" + pathAndQuery, "http://local").pathname;

  if (pathname === "/api/runtime-paths") {
    return json(200, {
      dataRoot,
      exportFolder: path.join(dataRoot, "export"),
      projectsFolder: path.join(dataRoot, "projects"),
    });
  }
  if (pathname === "/api/save-project") return json(200, saveProject(body));
  if (pathname === "/api/extensions" || pathname === "/api/extensions/refresh" ||
      (pathname.startsWith("/api/extensions/") && pathname.endsWith("/run"))) {
    return extensionService.dispatch(method, pathname, body);
  }
  if (pathname === "/api/cep/status") return json(200, psInterop.cepPanelStatus());
  if (pathname === "/api/cep/install") return json(200, psInterop.installCepPanel());
  if (pathname === "/api/cep/uninstall") return json(200, psInterop.uninstallCepPanel());
  if (pathname === "/api/update/check") return json(200, await webUpdate.checkForUpdates());
  return forwardToLocalServer(pathAndQuery, method, body, apiKey);
}

// 热更新应用后重启 server 换内容根：先起新实例（旧端口占用时 server.js 自动换新端口），
// 窗口切到新地址后再延迟关闭旧实例，避免切换期间出现无服务空窗。
async function restartServerWithContentRoot(newContentRoot) {
  const instance = await startCanvasFlowServer({
    dataRoot,
    port: Number(process.env.CANVASFLOW_PORT) || 5173,
    contentRoot: newContentRoot,
  });
  const previous = serverInstance;
  serverPort = instance.port;
  serverUrl = instance.url;
  serverInstance = instance;
  serverInstances.push(instance);
  if (previous && previous !== instance) {
    setTimeout(() => { previous.close().catch(() => { }); }, 3000);
  }
  console.log(`[CanvasFlow] 界面热更新生效，内容根：${newContentRoot}`);
  if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(serverUrl);
  return instance;
}

// ---------- 桌面 RPC（对齐 MainWindow 注入的 canvasflowDesktop 各方法） ----------

function resolveDataPath(filePath) {
  const raw = String(filePath || "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(dataRoot, raw);
}

function openFileLocation(filePath) {
  const full = resolveDataPath(filePath);
  if (!full || !fs.existsSync(full)) throw new Error("生成图片文件不存在，可能已被移动或删除");
  shell.showItemInFolder(full);
  return { opened: true, path: full };
}

function openAssetLocation(assetId) {
  if (!assetId) throw new Error("图片没有可用的素材编号");
  const full = assetStore.assetFilePath(assetId);
  shell.showItemInFolder(full);
  return { opened: true, path: full };
}

function openOutputFolder(folderPath) {
  const raw = String(folderPath || "").trim();
  if (!raw) throw new Error("生成文件夹路径为空");
  const full = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(dataRoot, raw);
  fs.mkdirSync(full, { recursive: true });
  shell.openPath(full);
  return { opened: true, path: full };
}

function copyImage(filePath) {
  const full = resolveDataPath(filePath);
  if (!full || !fs.existsSync(full)) throw new Error("图片文件不存在，可能已被移动或删除");
  const image = nativeImage.createFromPath(full);
  if (image.isEmpty()) throw new Error("该图片格式无法复制到剪贴板");
  clipboard.writeImage(image);
  return { copied: true, path: full };
}

async function chooseOutputFolder(currentPath, purpose) {
  const options = {
    title: purpose === "project" ? "选择项目文件保存位置" : "选择生成文件保存位置",
    properties: ["openDirectory", "createDirectory"],
  };
  const current = resolveDataPath(currentPath);
  if (current && fs.existsSync(current) && fs.statSync(current).isDirectory()) options.defaultPath = current;
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (result.canceled || !result.filePaths.length) return { cancelled: true, path: String(currentPath || "") };
  return { cancelled: false, path: result.filePaths[0] };
}

async function chooseLibraryFile(currentPath) {
  const options = {
    title: "导入素材",
    filters: [{ name: "CanvasFlow/JSON 文件", extensions: ["cflow", "json"] }],
    properties: ["openFile"],
  };
  const current = resolveDataPath(currentPath);
  if (current && fs.existsSync(current)) options.defaultPath = current;
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  const selected = result.filePaths[0];
  const stat = fs.statSync(selected);
  if (stat.size > 180 * 1024 * 1024) throw new Error("素材文件超过180MB限制");
  return { cancelled: false, name: path.basename(selected), content: fs.readFileSync(selected, "utf-8") };
}

const IMAGE_MIMES = new Map([[".png", "image/png"], [".gif", "image/gif"], [".webp", "image/webp"]]);

async function chooseImageFile(currentPath) {
  const options = {
    title: "选择图片",
    filters: [{ name: "图片文件", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
    properties: ["openFile"],
  };
  const current = resolveDataPath(currentPath);
  if (current && fs.existsSync(current)) options.defaultPath = current;
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  const selected = result.filePaths[0];
  const stat = fs.statSync(selected);
  if (stat.size > 180 * 1024 * 1024) throw new Error("图片文件超过180MB限制");
  const mime = IMAGE_MIMES.get(path.extname(selected).toLowerCase()) || "image/jpeg";
  return { cancelled: false, name: path.basename(selected), mime, size: stat.size, data: fs.readFileSync(selected).toString("base64") };
}

async function choosePsExe() {
  const isWin = process.platform === "win32";
  const options = {
    title: "选择 Photoshop 主程序",
    filters: [isWin ? { name: "photoshop.exe", extensions: ["exe"] } : { name: "Adobe Photoshop", extensions: ["app"] }],
    properties: ["openFile"],
    defaultPath: isWin ? "C:\\Program Files\\Adobe" : "/Applications",
  };
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (result.canceled || !result.filePaths.length) return { cancelled: true, path: "" };
  const selected = result.filePaths[0];
  // 选完立即落盘（与 Windows DesktopApi 行为一致，前端提示“已选择并保存”）
  try {
    psInterop.savePsPath(selected);
    return { cancelled: false, path: selected, saved: true };
  } catch (error) {
    return { cancelled: false, path: selected, saved: false, error: error.message };
  }
}

function registerIpc() {
  ipcMain.handle("desktop:api", async (_event, payload) => {
    const request = payload || {};
    try {
      return await routeApi(String(request.path || ""), String(request.method || "GET"),
        typeof request.body === "string" ? request.body : "", String(request.apiKey || ""));
    } catch (error) {
      console.warn(`[桌面接口] 请求失败：${request.method} ${request.path}。详细信息：${error.message}`);
      return json(500, { error: error.message || String(error) });
    }
  });
  ipcMain.handle("desktop:store-image", (_event, payload) => {
    try {
      const record = assetStore.storeImageData(payload.dataUrl, payload.fileName, payload.category);
      return record;
    } catch (error) {
      throw new Error(error.message || String(error));
    }
  });
  ipcMain.handle("desktop:read-asset", (_event, payload) => {
    try { return assetStore.readAsset(payload.assetId); }
    catch (error) { throw new Error(error.message || String(error)); }
  });
  ipcMain.handle("desktop:open-file-location", (_event, payload) => wrapIpc(() => openFileLocation(payload.filePath)));
  ipcMain.handle("desktop:open-asset-location", (_event, payload) => wrapIpc(() => openAssetLocation(payload.assetId)));
  ipcMain.handle("desktop:open-output-folder", (_event, payload) => wrapIpc(() => openOutputFolder(payload.folderPath)));
  ipcMain.handle("desktop:copy-image", (_event, payload) => wrapIpc(() => copyImage(payload.filePath)));
  ipcMain.handle("desktop:choose-output-folder", (_event, payload) => chooseOutputFolder(payload.currentPath, payload.purpose));
  ipcMain.handle("desktop:choose-library-file", (_event, payload) => chooseLibraryFile(payload.currentPath));
  ipcMain.handle("desktop:choose-image-file", (_event, payload) => chooseImageFile(payload.currentPath));
  ipcMain.handle("desktop:get-api-key", () => ({ apiKey: readApiKey("apimart"), agtokenApiKey: readApiKey("agtoken") }));
  ipcMain.handle("desktop:save-api-key", (_event, payload) => saveApiKey(payload.apiKey, payload.apiType));
  ipcMain.handle("desktop:get-ps-path", () => wrapIpc(() => psInterop.getPsPath()));
  ipcMain.handle("desktop:save-ps-path", (_event, payload) => wrapIpc(() => psInterop.savePsPath(payload.path)));
  ipcMain.handle("desktop:choose-ps-exe", () => choosePsExe());
  ipcMain.handle("desktop:launch-in-ps", async (_event, payload) => {
    try {
      return await psInterop.launchInPs(payload.outputPath, payload.fileName, payload.assetId);
    } catch (error) {
      throw new Error(error.message || String(error));
    }
  });
  ipcMain.handle("desktop:save-complete", (_event, result) => {
    if (pendingSaveComplete && result && result.requestId === pendingSaveRequestId) {
      const resolve = pendingSaveComplete;
      pendingSaveComplete = null;
      resolve(result);
    }
    return { ok: true };
  });
  ipcMain.handle("desktop:web-ready", () => {
    webUpdate.confirmActiveVersionReady();
    return { ok: true };
  });
  ipcMain.handle("desktop:apply-web-update", async () => {
    const result = await webUpdate.applyLatestWebUpdate();
    await restartServerWithContentRoot(result.contentRoot);
    return { applied: true, version: result.version };
  });
}

function wrapIpc(fn) {
  try {
    return fn();
  } catch (error) {
    throw new Error(error.message || String(error));
  }
}

// ---------- 窗口、菜单、生命周期 ----------

function windowStateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(windowStateFile(), "utf-8")); }
  catch (_) { return {}; }
}

function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    const bounds = win.getNormalBounds();
    fs.mkdirSync(path.dirname(windowStateFile()), { recursive: true });
    fs.writeFileSync(windowStateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }, null, 2), "utf-8");
  } catch (_) { /* 状态丢失可接受 */ }
}

function buildMenu() {
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    }] : [{
      label: "文件",
      submenu: [{ role: "quit" }],
    }]),
    {
      label: "编辑",
      submenu: [
        { role: "undo" }, { role: "redo" },
        { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: isMac
        ? [{ role: "minimize" }, { role: "zoom" }, { role: "front" }]
        : [{ role: "minimize" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function requestSaveThenClose(win) {
  return new Promise(resolve => {
    // 页面还没加载完成时 onSaveRequest 尚未注册，等不到回执，直接放行
    if (win.isDestroyed() || !win.webContents || !win.webContents.getURL()) { resolve(null); return; }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pendingSaveComplete = null;
      resolve();
    };
    pendingSaveRequestId = `sr-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    pendingSaveComplete = finish;
    win.webContents.send("desktop-save-request", { requestId: pendingSaveRequestId, reason: "window-close" });
    setTimeout(finish, 5000);
  });
}

function createWindow() {
  const saved = loadWindowState();
  const win = new BrowserWindow({
    width: saved.width || 1440,
    height: saved.height || 900,
    x: Number.isFinite(saved.x) ? saved.x : undefined,
    y: Number.isFinite(saved.y) ? saved.y : undefined,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "CanvasFlow",
    backgroundColor: "#f4f4f5",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  if (saved.maximized) win.maximize();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(serverUrl)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  win.once("ready-to-show", () => win.show());
  win.on("close", async event => {
    if (win.__cfClosing) { saveWindowState(win); return; }
    // 所有关闭路径（X / Cmd+W / Cmd+Q）都先走"退出前保存"：持久化状态 + 自动备份
    event.preventDefault();
    await requestSaveThenClose(win);
    saveWindowState(win);
    win.__cfClosing = true;
    win.destroy();
  });
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });
  win.loadURL(serverUrl);
  mainWindow = win;
}

function handleDownloads() {
  session.defaultSession.on("will-download", (event, item) => {
    const dir = path.join(app.getPath("downloads"), "CanvasFlow");
    fs.mkdirSync(dir, { recursive: true });
    const original = item.getFilename() || "download";
    const ext = path.extname(original);
    const stem = ext ? original.slice(0, -ext.length) : original;
    let target = path.join(dir, original);
    for (let index = 1; fs.existsSync(target) && index < 500; index++) {
      target = path.join(dir, `${stem}(${index})${ext}`);
    }
    item.setSavePath(target);
    item.once("done", (_e, state) => {
      if (state === "completed") console.log(`[下载] 已保存：${target}`);
      else console.warn(`[下载] 未完成（${state}）：${target}`);
    });
  });
}

app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }
  if (serverUrl) createWindow();
});

app.on("before-quit", event => {
  appQuitting = true;
  const pending = serverInstances.filter(instance => instance && !instance.__closed);
  if (pending.length && !serverClosed) {
    serverClosed = true;
    event.preventDefault();
    Promise.all(pending.map(instance => {
      instance.__closed = true;
      return instance.close().catch(() => { });
    })).finally(() => app.quit());
  }
});

app.on("window-all-closed", () => {
  // mac 惯例：关窗不退出，点 Dock 图标恢复；显式退出（Cmd+Q）走 before-quit。
  if (!isMac || appQuitting) app.quit();
});

app.on("activate", () => {
  if (!mainWindow && serverUrl) createWindow();
});

app.whenReady().then(async () => {
  if (!gotLock) return;
  const extensionsFolder = extensionService.init({ appRoot: __dirname, isPackaged: app.isPackaged });
  assetStore.init(dataRoot);
  webUpdate.init({
    dataRoot,
    bundledRoot: __dirname,
    hostVersion: APP_VERSION,
    log: (message, warn) => { if (warn) console.warn(message); else console.log(message); },
  });
  // 热更新界面版本严格高于宿主才启用，否则回退随包界面（与 Windows 版 ResolveContentRoot 一致）
  const contentRoot = webUpdate.resolveContentRoot();
  psInterop.init({ dataRoot, appRoot: __dirname, getContentRoot: () => webUpdate.currentContentRoot });
  for (const folder of ["data", "download", "export", "projects"]) fs.mkdirSync(path.join(dataRoot, folder), { recursive: true });

  const instance = await startCanvasFlowServer({ dataRoot, port: Number(process.env.CANVASFLOW_PORT) || 5173, contentRoot });
  serverInstances.push(instance);
  serverPort = instance.port;
  serverUrl = instance.url;
  serverInstance = instance;
  console.log(`[CanvasFlow] 数据目录：${dataRoot}`);
  console.log(`[CanvasFlow] 界面目录：${contentRoot}`);
  console.log(`[CanvasFlow] 拓展文件夹：${extensionsFolder}`);

  registerIpc();
  handleDownloads();
  buildMenu();
  app.setAboutPanelOptions({
    applicationName: "CanvasFlow",
    applicationVersion: APP_VERSION,
    version: APP_VERSION,
  });
  createWindow();
});
