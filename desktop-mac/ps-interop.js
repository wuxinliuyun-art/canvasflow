// Photoshop 互传：CEP 面板一键安装/状态/卸载、PS 主程序路径、在 PS 中打开图片。
// 行为对齐 Windows 桌面版 DesktopApi 的 /api/cep/* 与 psPath/launchInPs；
// 纯 Node 实现（不依赖 electron），由 main.js 负责路由与 IPC 接线。
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assetStore = require("./asset-store.js");

let dataRoot = "";
let appRoot = "";
let psPathFile = "";
let getContentRoot = null;

function init({ dataRoot: root, appRoot: dir, getContentRoot: contentRootFn }) {
  dataRoot = path.resolve(root);
  appRoot = path.resolve(dir);
  getContentRoot = typeof contentRootFn === "function" ? contentRootFn : null;
  psPathFile = path.join(dataRoot, "data", "ps-path.txt");
}

function isWin() {
  return process.platform === "win32";
}

function atomicWriteFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf-8");
  fs.renameSync(tempPath, filePath);
}

// ---- CEP 面板：状态 / 安装 / 卸载 ----

// 面板源随热更新走：界面热更新包会把 cep-panel 带进内容根，安装面板时优先取内容根里的版本
// （对齐 Windows DesktopApi.ResolveCepPanelSourceFolder：内容根 → 随包目录）
function cepPanelSourceDir() {
  const candidates = [];
  const contentRoot = getContentRoot ? getContentRoot() : "";
  if (contentRoot) candidates.push(path.join(contentRoot, "cep-panel", "CanvasFlowPanel"));
  candidates.push(path.join(appRoot, "cep-panel", "CanvasFlowPanel"));
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "CSXS", "manifest.xml"))) return candidate;
  }
  return candidates[candidates.length - 1];
}

function cepExtensionsRoot() {
  return isWin()
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Adobe", "CEP", "extensions")
    : path.join(os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
}

function readManifestVersion(manifestPath) {
  try {
    const match = fs.readFileSync(manifestPath, "utf-8").match(/ExtensionBundleVersion="([^"]+)"/);
    return match ? match[1] : "";
  } catch (_) {
    return "";
  }
}

function cepPanelStatus() {
  const target = path.join(cepExtensionsRoot(), "CanvasFlowPanel");
  const sourceVersion = readManifestVersion(path.join(cepPanelSourceDir(), "CSXS", "manifest.xml"));
  const installedVersion = readManifestVersion(path.join(target, "CSXS", "manifest.xml"));
  return {
    sourceExists: Boolean(sourceVersion),
    installed: Boolean(installedVersion),
    installFolder: target,
    sourceVersion,
    installedVersion,
    needsUpdate: Boolean(sourceVersion && installedVersion && installedVersion !== sourceVersion),
  };
}

function enableCepDebugMode() {
  if (isWin()) {
    for (const version of ["9", "10", "11", "12"]) {
      spawnSync("reg", ["add", `HKCU\\Software\\Adobe\\CSXS.${version}`, "/v", "PlayerDebugMode", "/t", "REG_SZ", "/d", "1", "/f"], { stdio: "ignore" });
    }
    return;
  }
  // mac：未签名面板必需；写用户级 defaults，字符串型与 Adobe CEP 文档一致
  for (const domain of ["com.adobe.csxsinfo", "com.adobe.CSXS.9", "com.adobe.CSXS.10", "com.adobe.CSXS.11", "com.adobe.CSXS.12"]) {
    const probe = spawnSync("defaults", ["write", domain, "PlayerDebugMode", "-string", "1"], { encoding: "utf-8" });
    if (probe.status !== 0) {
      throw new Error(`写入 ${domain} PlayerDebugMode 失败：${String(probe.stderr || "").trim() || "未知错误"}`);
    }
  }
}

function installCepPanel() {
  const source = cepPanelSourceDir();
  if (!fs.existsSync(path.join(source, "CSXS", "manifest.xml"))) {
    throw new Error("未找到随包面板文件（cep-panel/CanvasFlowPanel）：安装版需重新打包，源码版请检查仓库目录");
  }
  const target = path.join(cepExtensionsRoot(), "CanvasFlowPanel");
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  enableCepDebugMode();
  console.log(`[PS 面板] 已安装到 ${target}，并写入 CEP 调试模式开关`);
  return { success: true, folder: target, version: readManifestVersion(path.join(target, "CSXS", "manifest.xml")) };
}

function uninstallCepPanel() {
  const target = path.join(cepExtensionsRoot(), "CanvasFlowPanel");
  if (!fs.existsSync(target)) return { success: true, missing: true };
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[PS 面板] 已移除 ${target}`);
  return { success: true };
}

// ---- PS 主程序路径（data/ps-path.txt）----

function getPsPath() {
  try {
    return { path: fs.readFileSync(psPathFile, "utf-8").trim() };
  } catch (_) {
    return { path: "" };
  }
}

function savePsPath(value) {
  const raw = String(value ?? "").trim();
  if (raw) {
    if (isWin()) {
      if (!/\.exe$/i.test(raw) || !fs.existsSync(raw)) throw new Error("请选择已安装的 photoshop.exe");
    } else {
      if (!/\.app$/i.test(raw) || !fs.existsSync(raw)) {
        throw new Error("请选择已安装的 Photoshop.app（如 /Applications/Adobe Photoshop 2022/Adobe Photoshop 2022.app）");
      }
      const probe = spawnSync("plutil", ["-extract", "CFBundleIdentifier", "raw", path.join(raw, "Contents", "Info.plist")], { encoding: "utf-8" });
      if (probe.status !== 0 || !/photoshop/i.test(String(probe.stdout || ""))) {
        throw new Error("所选应用不是 Photoshop（Bundle ID 不是 com.adobe.Photoshop），请重新选择");
      }
    }
    atomicWriteFile(psPathFile, raw);
  } else {
    fs.rmSync(psPathFile, { force: true });
  }
  return { success: true, path: raw };
}

// ---- 在 PS 中打开图片（解析顺序与 Windows 版一致：outputPath → download/images → 素材库）----

function resolvePsTargetFile(outputPath, fileName, assetId) {
  const candidates = [];
  const output = String(outputPath || "").trim();
  if (output) candidates.push(path.isAbsolute(output) ? path.resolve(output) : path.resolve(dataRoot, output));
  const name = path.basename(String(fileName || "").trim());
  if (name) candidates.push(path.join(dataRoot, "download", "images", name));
  const asset = String(assetId || "").trim();
  if (asset) {
    try { candidates.push(assetStore.assetFilePath(asset)); }
    catch (_) { /* 素材不存在时交给后面的存在性检查 */ }
  }
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch (_) { /* 试下一个候选 */ }
  }
  throw new Error("找不到图片的本地文件（outputPath、download/images、素材库都没有），请先在画布里重新生成或导入");
}

// mac 兜底：设置里没配路径时，扫描常见位置找已装的 Photoshop（应用名带年份，直接 open -a 名字会找不到）
function defaultMacPhotoshopApp() {
  for (const dir of ["/Applications", path.join(os.homedir(), "Applications")]) {
    try {
      const hit = fs.readdirSync(dir)
        .filter(name => /^Adobe Photoshop.*\.app$/i.test(name))
        .sort()
        .pop();
      if (hit) return path.join(dir, hit);
    } catch (_) { /* 目录不存在试下一个 */ }
  }
  return "Adobe Photoshop";
}

async function launchInPs(outputPath, fileName, assetId) {
  const file = resolvePsTargetFile(outputPath, fileName, assetId);
  const saved = getPsPath().path;
  if (isWin()) {
    const child = spawn(saved || "photoshop.exe", [file], { detached: true, stdio: "ignore" });
    child.unref();
    return { opened: true, path: file };
  }
  const target = saved || defaultMacPhotoshopApp();
  const child = spawn("open", ["-a", target, file], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", chunk => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    child.once("error", error => reject(new Error(`无法启动 Photoshop：${error.message}`)));
    child.once("exit", code => {
      if (code === 0) resolve({ opened: true, path: file });
      else reject(new Error(`无法打开 Photoshop（open 退出码 ${code}）：${String(stderr || "").trim() || "未知原因"}（目标：${target}）`));
    });
  });
}

module.exports = { init, cepPanelStatus, installCepPanel, uninstallCepPanel, getPsPath, savePsPath, launchInPs };
