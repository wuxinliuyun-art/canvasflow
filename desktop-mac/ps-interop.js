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

// 从 Photoshop 应用路径中提取版本年份（如 "Adobe Photoshop 2026.app" → 2026），
// 用于多版本并存时按年份数字排序，而不是对完整路径做字符串排序。
function photoshopVersionYear(candidate) {
  const match = /(20\d{2})/.exec(path.basename(String(candidate || "")));
  return match ? Number(match[1]) : 0;
}

// mac 兜底：设置里没配路径时，扫描常见位置找已装的 Photoshop。
// Adobe 通常把 .app 放在带年份的子目录中（如 /Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app），
// 也可能直接放在 Applications 目录下（如 /Applications/Adobe Photoshop 2022.app）。
function defaultMacPhotoshopApp(dirs) {
  const searchDirs = Array.isArray(dirs) && dirs.length
    ? dirs
    : ["/Applications", path.join(os.homedir(), "Applications")];
  const candidates = [];
  // 只收真实存在的候选：应用被删后残留的断链 .app 不能算"已安装"，
  // 否则会跳过扫描结果、让 open -a 报一个无从下手的退出码。
  const addCandidate = candidate => {
    if (fs.existsSync(candidate)) candidates.push(candidate);
  };
  for (const dir of searchDirs) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        // 普通文件既不是 .app 包也不会是版本目录；目录与符号链接（用户可能把安装目录链过来）都要看
        if (entry.isFile()) continue;
        if (!/^Adobe Photoshop/i.test(entry.name)) continue;
        const item = path.join(dir, entry.name);
        if (/\.app$/i.test(entry.name)) {
          // 直接放在 Applications 下的 .app 包
          addCandidate(item);
          continue;
        }
        // 带年份的子目录：只向下看一层，不做无界限递归扫描
        try {
          for (const child of fs.readdirSync(item, { withFileTypes: true })) {
            if (child.isFile()) continue;
            if (/^Adobe Photoshop.*\.app$/i.test(child.name)) addCandidate(path.join(item, child.name));
          }
        } catch (_) { /* 不是目录或不可读，忽略这一项 */ }
      }
    } catch (_) { /* 目录不存在或不可读，试下一个 */ }
  }
  // 优先按版本年份数字升序，同年份再按路径做数值化比较保证结果稳定；取最新版本
  candidates.sort((a, b) => {
    const yearDelta = photoshopVersionYear(a) - photoshopVersionYear(b);
    if (yearDelta !== 0) return yearDelta;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  return candidates[candidates.length - 1] || "";
}

// 解析最终要打开的应用：用户手动保存且仍然有效的路径优先；
// 失效时回退到自动扫描；仍找不到则给出明确中文错误，引导到设置中手动选择。
function resolvePhotoshopApp(savedPath, dirs) {
  const saved = String(savedPath || "").trim();
  if (saved && fs.existsSync(saved)) return saved;
  const discovered = defaultMacPhotoshopApp(dirs);
  if (!discovered) {
    throw new Error("未找到 Photoshop.app，请到设置中手动选择 Photoshop 主程序路径");
  }
  return discovered;
}

async function launchInPs(outputPath, fileName, assetId) {
  const file = resolvePsTargetFile(outputPath, fileName, assetId);
  const saved = getPsPath().path;
  if (isWin()) {
    const child = spawn(saved || "photoshop.exe", [file], { detached: true, stdio: "ignore" });
    child.unref();
    return { opened: true, path: file };
  }
  const target = resolvePhotoshopApp(saved);
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

module.exports = { init, cepPanelStatus, installCepPanel, uninstallCepPanel, getPsPath, savePsPath, launchInPs, defaultMacPhotoshopApp, photoshopVersionYear, resolvePhotoshopApp };
