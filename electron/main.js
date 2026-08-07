"use strict";

const { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, net, safeStorage, screen, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { startCanvasFlowServer, latestReleaseInfo, APP_VERSION } = require("../server");

const repoRoot = path.resolve(__dirname, "..");
const applicationRoot = app.isPackaged ? path.dirname(process.execPath) : repoRoot;
const dataDirectory = path.join(applicationRoot, "data");
const downloadDirectory = path.join(applicationRoot, "download");
const exportDirectory = path.join(applicationRoot, "export");
const preloadPath = path.join(__dirname, "preload.js");
const statePath = path.join(dataDirectory, "app-state.json");
const screenshotSettingsPath = path.join(dataDirectory, "screenshot-settings.json");
const secretsPath = path.join(dataDirectory, "secrets.json");

let panelWindow = null;
let captureOverlay = null;
let serverInstance = null;
let downloadedInstaller = "";
let sessionApiKey = "";
let isQuitting = false;
let generationActive = false;
let pendingSelection = null;
const logs = [];

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  try { fs.renameSync(tempPath, filePath); }
  catch (error) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    fs.renameSync(tempPath, filePath);
  }
}

function readJson(filePath, fallback = {}) {
  try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
  catch (error) { log("warn", `读取文件失败：${filePath}`, error.message); return fallback; }
}

function stringifyLogPart(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function log(level, ...parts) {
  const entry = { time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), level, message: parts.map(stringifyLogPart).join(" ") };
  logs.push(entry);
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send("desktop:log", entry);
}

function installConsoleRelay() {
  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...parts) => { original(...parts); log(level, ...parts); };
  }
}

function ensureDirectories() {
  for (const directory of [dataDirectory, downloadDirectory, exportDirectory]) fs.mkdirSync(directory, { recursive: true });
}

function isDirectoryEmpty(directory) {
  try { return !fs.existsSync(directory) || fs.readdirSync(directory).length === 0; }
  catch (_) { return false; }
}

function copyMissing(source, destination, summary) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyMissing(from, to, summary);
    else if (fs.existsSync(to)) summary.skipped += 1;
    else { fs.copyFileSync(from, to); summary.copied += 1; }
  }
}

async function migrateLegacyData() {
  const markerPath = path.join(dataDirectory, "migration-state.json");
  if (fs.existsSync(markerPath)) return;
  const wasEmpty = [dataDirectory, downloadDirectory, exportDirectory].every(isDirectoryEmpty);
  ensureDirectories();
  const legacyRoot = path.join(os.homedir(), "Documents", "CanvasFlow");
  if (!wasEmpty || !fs.existsSync(legacyRoot) || path.resolve(legacyRoot) === path.resolve(applicationRoot)) {
    atomicWriteJson(markerPath, { checkedAt: new Date().toISOString(), migrated: false, reason: "not-needed" });
    return;
  }
  const choice = await dialog.showMessageBox({
    type: "question", buttons: ["复制旧数据", "暂不迁移"], defaultId: 0, cancelId: 1,
    title: "发现旧版 CanvasFlow 数据",
    message: "是否把“文档\\CanvasFlow”中的旧数据复制到新版？",
    detail: "只复制，不会移动或删除旧文件；已有同名文件不会被覆盖。API Key 需要重新输入。",
  });
  const summary = { copied: 0, skipped: 0 };
  if (choice.response === 0) {
    for (const name of ["data", "download", "export"]) copyMissing(path.join(legacyRoot, name), path.join(applicationRoot, name), summary);
    log("info", `[迁移] 已复制 ${summary.copied} 个文件，跳过 ${summary.skipped} 个同名文件`);
    await offerBackupRecovery();
  }
  atomicWriteJson(markerPath, { checkedAt: new Date().toISOString(), migrated: choice.response === 0, ...summary });
}

async function offerBackupRecovery() {
  if (fs.existsSync(statePath)) return;
  const backupDirectory = path.join(downloadDirectory, "自动备份");
  if (!fs.existsSync(backupDirectory)) return;
  const candidates = fs.readdirSync(backupDirectory)
    .filter(name => name.toLowerCase().endsWith(".json"))
    .map(name => ({ path: path.join(backupDirectory, name), mtime: fs.statSync(path.join(backupDirectory, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!candidates.length) return;
  const choice = await dialog.showMessageBox({
    type: "question", buttons: ["恢复最近项目", "跳过"], defaultId: 0, cancelId: 1,
    title: "恢复项目", message: "检测到旧版自动备份，是否恢复最近保存的项目？",
    detail: path.basename(candidates[0].path),
  });
  if (choice.response !== 0) return;
  try {
    const backup = readJson(candidates[0].path, null);
    if (!backup || !Array.isArray(backup.pages)) throw new Error("备份内容不是有效的 CanvasFlow 项目");
    atomicWriteJson(statePath, { pages: backup.pages, activePageId: backup.activePageId, nextPageNum: backup.pages.length + 1 });
    log("info", `[迁移] 已恢复项目：${path.basename(candidates[0].path)}`);
  } catch (error) {
    dialog.showErrorBox("恢复失败", `备份无法恢复：${error.message}\n\n原备份没有被修改。`);
  }
}

function readApiKey() {
  if (sessionApiKey) return sessionApiKey;
  const saved = readJson(secretsPath, {});
  if (!saved.apiKey || !safeStorage.isEncryptionAvailable()) return "";
  try { return safeStorage.decryptString(Buffer.from(saved.apiKey, "base64")); }
  catch (error) { log("warn", "[安全存储] API Key 解密失败", error.message); return ""; }
}

function saveApiKey(value) {
  sessionApiKey = String(value || "").trim();
  if (!sessionApiKey) { try { if (fs.existsSync(secretsPath)) fs.unlinkSync(secretsPath); } catch (_) {} return { saved: true, persistent: true }; }
  if (!safeStorage.isEncryptionAvailable()) {
    log("warn", "[安全存储] 系统加密不可用，API Key 仅保留到本次退出");
    return { saved: true, persistent: false, warning: "系统安全存储不可用，API Key 只在本次运行有效。" };
  }
  atomicWriteJson(secretsPath, { version: 1, apiKey: safeStorage.encryptString(sessionApiKey).toString("base64") });
  return { saved: true, persistent: true };
}

function secureWebPreferences() {
  return { preload: preloadPath, nodeIntegration: false, contextIsolation: true, sandbox: true };
}

function sendStatus() {
  const status = {
    running: !!serverInstance, port: serverInstance ? serverInstance.port : null, version: APP_VERSION,
    url: serverInstance ? serverInstance.url : "", dataRoot: applicationRoot,
    logs,
  };
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send("desktop:status", status);
  return status;
}

function restrictNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(error => log("error", "打开链接失败", error.message));
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (serverInstance && url.startsWith(serverInstance.url)) return;
    event.preventDefault();
  });
}

function openCanvas() {
  if (serverInstance) {
    clipboard.writeText(serverInstance.url);
    return { ok: true, url: serverInstance.url };
  }
  return { ok: false };
}

function savedPanelSettings() { return readJson(screenshotSettingsPath, {}); }

function persistPanelWindowState() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const settings = savedPanelSettings();
  const bounds = panelWindow.getBounds();
  const previous = settings.windowBounds || {};
  settings.windowBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height > 100 ? bounds.height : (previous.height || 720) };
  settings.compact = bounds.height <= 100;
  settings.alwaysOnTop = panelWindow.isAlwaysOnTop();
  atomicWriteJson(screenshotSettingsPath, settings);
}

function openPanel() {
  if (panelWindow && !panelWindow.isDestroyed()) { panelWindow.show(); panelWindow.focus(); sendStatus(); return; }
  const settings = savedPanelSettings();
  const fallback = { width: 390, height: 720 };
  const bounds = settings.windowBounds && Number.isFinite(settings.windowBounds.x) ? settings.windowBounds : fallback;
  const initialHeight = settings.compact ? 60 : Math.max(680, bounds.height || fallback.height);
  panelWindow = new BrowserWindow({
    ...bounds, width: Math.max(320, bounds.width || fallback.width), height: initialHeight,
    minWidth: 320, minHeight: 60, frame: false, transparent: false, resizable: true, show: false,
    skipTaskbar: false, alwaysOnTop: settings.alwaysOnTop !== false, title: "CanvasFlow", autoHideMenuBar: true,
    webPreferences: secureWebPreferences(),
  });
  restrictNavigation(panelWindow);
  panelWindow.loadURL(`${serverInstance.url}screenshot-panel.html`);
  panelWindow.once("ready-to-show", () => { panelWindow.show(); sendStatus(); });
  panelWindow.on("move", persistPanelWindowState);
  panelWindow.on("resize", persistPanelWindowState);
  panelWindow.on("close", event => {
    if (isQuitting) return;
    event.preventDefault(); persistPanelWindowState(); panelWindow.hide(); sendStatus();
  });
  panelWindow.on("closed", () => { panelWindow = null; sendStatus(); });
}

function displayDescriptor(display) {
  return {
    id: String(display.id), bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor,
    fingerprint: `${display.bounds.x},${display.bounds.y},${display.bounds.width},${display.bounds.height}@${display.scaleFactor}`,
  };
}

function findSavedDisplay(saved) {
  if (!saved) return null;
  return screen.getAllDisplays().find(display => String(display.id) === String(saved.id) && displayDescriptor(display).fingerprint === saved.fingerprint) || null;
}

async function captureDisplay(display) {
  const physicalSize = { width: Math.max(1, Math.round(display.bounds.width * display.scaleFactor)), height: Math.max(1, Math.round(display.bounds.height * display.scaleFactor)) };
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: physicalSize, fetchWindowIcons: false });
  let source = sources.find(item => String(item.display_id) === String(display.id));
  if (!source && sources.length === 1) source = sources[0];
  if (!source) throw new Error("无法匹配要截取的显示器，请重新框选区域");
  const image = source.thumbnail;
  const size = image.getSize();
  if (!size.width || !size.height) throw new Error("系统没有返回屏幕图像");
  return { dataUrl: image.toDataURL(), width: size.width, height: size.height, display: displayDescriptor(display) };
}

function hideAuxiliaryWindows() {
  if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) { panelWindow.hide(); return true; }
  return false;
}

function restoreWindows() {
  if (panelWindow && !panelWindow.isDestroyed()) { panelWindow.showInactive(); panelWindow.focus(); }
}

function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

function selectRegion(capture, display) {
  return new Promise((resolve, reject) => {
    captureOverlay = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height,
      frame: false, resizable: false, movable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true,
      title: "CanvasFlow 截图框选", backgroundColor: "#000000", webPreferences: secureWebPreferences(),
    });
    captureOverlay.setAlwaysOnTop(true, "screen-saver");
    restrictNavigation(captureOverlay);
    captureOverlay.loadFile(path.join(__dirname, "capture-overlay.html"));
    const finish = value => {
      const overlay = captureOverlay;
      captureOverlay = null; pendingSelection = null;
      if (overlay && !overlay.isDestroyed()) overlay.destroy();
      resolve(value);
    };
    pendingSelection = { finish, reject };
    captureOverlay.webContents.once("did-finish-load", () => captureOverlay.webContents.send("capture:init", capture));
    captureOverlay.on("closed", () => { if (pendingSelection) finish(null); });
    captureOverlay.show(); captureOverlay.focus();
  });
}

async function captureRegion(options = {}) {
  const automatic = options.mode === "auto";
  const display = automatic ? findSavedDisplay(options.display) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (!display) throw new Error("保存的显示器或缩放设置已变化，请重新设置截取区域");
  const hidden = hideAuxiliaryWindows();
  try {
    await wait(220);
    const capture = await captureDisplay(display);
    if (automatic) {
      const crop = options.cropPercent;
      if (!crop || crop.w <= 0 || crop.h <= 0 || crop.x < 0 || crop.y < 0 || crop.x + crop.w > 100.001 || crop.y + crop.h > 100.001) {
        throw new Error("保存的截取区域无效，请重新设置");
      }
      return { ...capture, cropPercent: crop };
    }
    const selection = await selectRegion(capture, display);
    if (!selection) return { cancelled: true };
    return { ...capture, cropPercent: selection };
  } finally {
    restoreWindows();
  }
}

async function quitApplication(reason = "exit") {
  if (generationActive) {
    const choice = await dialog.showMessageBox(panelWindow || undefined, { type: "warning", buttons: ["继续等待", "停止任务并退出"], defaultId: 0, cancelId: 0, title: "图片仍在生成", message: "截图面板还有生成任务，确定要退出吗？" });
    if (choice.response === 0) return { ok: false, cancelled: true };
  }
  isQuitting = true;
  await serverInstance?.close().catch(error => log("error", "关闭服务失败", error.message));
  app.quit();
  return { ok: true };
}

async function downloadUpdate() {
  const info = await latestReleaseInfo();
  if (!info.hasUpdate) return { ok: false, error: "当前已经是最新版" };
  if (!info.asset || !info.asset.url || !/\.exe$/i.test(info.asset.name)) throw new Error("Release 中没有可用的 CanvasFlow-Setup.exe");
  const updateDirectory = path.join(downloadDirectory, "updates");
  fs.mkdirSync(updateDirectory, { recursive: true });
  const destination = path.join(updateDirectory, "CanvasFlow-Setup.exe");
  const temporary = `${destination}.download`;
  const response = await net.fetch(info.asset.url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`);
  const file = fs.createWriteStream(temporary);
  const hash = crypto.createHash("sha256");
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value); received += chunk.length; hash.update(chunk);
      if (!file.write(chunk)) await new Promise(resolve => file.once("drain", resolve));
      panelWindow?.webContents.send("desktop:download-progress", { received, total: info.asset.size || 0 });
    }
    await new Promise((resolve, reject) => file.end(error => error ? reject(error) : resolve()));
  } catch (error) { file.destroy(); try { fs.unlinkSync(temporary); } catch (_) {} throw error; }
  if (info.asset.size && received !== info.asset.size) { fs.unlinkSync(temporary); throw new Error(`文件大小不一致：应为 ${info.asset.size}，实际 ${received}`); }
  const actualDigest = hash.digest("hex");
  const expectedDigest = String(info.asset.digest || "").replace(/^sha256:/i, "").toLowerCase();
  if (!expectedDigest) { fs.unlinkSync(temporary); throw new Error("GitHub Release API 未提供 SHA-256 digest，无法安全安装；请稍后重新检查更新"); }
  if (actualDigest !== expectedDigest) { fs.unlinkSync(temporary); throw new Error("SHA-256 校验不一致，安装包可能下载不完整，已停止更新"); }
  try { if (fs.existsSync(destination)) fs.unlinkSync(destination); } catch (_) {}
  fs.renameSync(temporary, destination); downloadedInstaller = destination;
  log("info", `[更新] 安装包下载完成：${destination}`);
  return { ok: true, path: destination, digest: actualDigest, verified: true };
}

async function installUpdate() {
  if (!downloadedInstaller || !fs.existsSync(downloadedInstaller)) return { ok: false, error: "请先下载新版安装包" };
  const error = await shell.openPath(downloadedInstaller);
  if (error) return { ok: false, error: `安装程序启动失败：${error}` };
  isQuitting = true;
  await serverInstance?.close().catch(() => {});
  app.quit();
  return { ok: true };
}

function registerIpc() {
  ipcMain.handle("desktop:get-status", () => sendStatus());
  ipcMain.handle("desktop:open-canvas", () => { openCanvas(); return { ok: true }; });
  ipcMain.handle("desktop:open-screenshot", () => { openPanel(); return { ok: true }; });
  ipcMain.handle("desktop:open-export", async () => {
    fs.mkdirSync(exportDirectory, { recursive: true });
    const error = await shell.openPath(exportDirectory);
    if (error) return { ok: false, error, path: exportDirectory };
    return { ok: true, path: exportDirectory };
  });
  ipcMain.handle("desktop:check-update", () => latestReleaseInfo());
  ipcMain.handle("desktop:download-update", async () => { try { return await downloadUpdate(); } catch (error) { log("error", "[更新] 下载失败", error.message); return { ok: false, error: error.message }; } });
  ipcMain.handle("desktop:install-update", () => installUpdate());
  ipcMain.handle("desktop:exit", () => quitApplication());
  ipcMain.handle("desktop:clear-logs", () => { logs.length = 0; sendStatus(); return { ok: true }; });
  ipcMain.handle("desktop:copy-text", (_event, value) => { clipboard.writeText(value); return { ok: true }; });
  ipcMain.handle("desktop:get-api-key", () => ({ apiKey: readApiKey() }));
  ipcMain.handle("desktop:save-api-key", (_event, value) => saveApiKey(value));
  ipcMain.handle("desktop:capture-region", (_event, options) => captureRegion(options));
  ipcMain.handle("desktop:set-panel-pinned", (_event, pinned) => { if (!panelWindow || panelWindow.isDestroyed()) return { ok: false }; panelWindow.setAlwaysOnTop(pinned, pinned ? "floating" : "normal"); persistPanelWindowState(); return { ok: true, pinned }; });
  ipcMain.handle("desktop:set-panel-compact", (_event, compact) => {
    if (!panelWindow || panelWindow.isDestroyed()) return { ok: false };
    const bounds = panelWindow.getBounds();
    const settings = savedPanelSettings();
    const expandedHeight = Math.max(680, settings.windowBounds?.height || 720);
    panelWindow.setBounds({ ...bounds, height: compact ? 60 : expandedHeight }, true);
    persistPanelWindowState();
    return { ok: true };
  });
  ipcMain.handle("desktop:close-panel", () => { panelWindow?.hide(); sendStatus(); return { ok: true }; });
  ipcMain.on("desktop:generation-active", (_event, active) => { generationActive = active; });
  ipcMain.on("capture:selection", (_event, selection) => { if (pendingSelection) pendingSelection.finish(selection); });
  ipcMain.on("capture:cancel", () => { if (pendingSelection) pendingSelection.finish(null); });
}

async function start() {
  installConsoleRelay();
  await migrateLegacyData();
  ensureDirectories();
  registerIpc();
  serverInstance = await startCanvasFlowServer({ dataRoot: applicationRoot, getApiKey: readApiKey });
  shell.openExternal(serverInstance.url);
  openPanel();
  log("info", `[Desktop] CanvasFlow ${APP_VERSION} started, dataDir: ${applicationRoot}`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (panelWindow) { if (panelWindow.isMinimized()) panelWindow.restore(); panelWindow.show(); panelWindow.focus(); } });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox("CanvasFlow 启动失败", `${error.message}\n\n请确认安装目录可写，或换到普通用户目录重新安装。`); app.quit(); });
  app.on("before-quit", event => { if (!isQuitting) event.preventDefault(); });
}
