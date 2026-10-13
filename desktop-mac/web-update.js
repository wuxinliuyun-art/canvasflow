// 界面热更新（Node 版 WebUpdateManager）：与 Windows 桌面版 desktop-dotnet/WebUpdateManager.cs
// 消费同一份 Release 资产 CanvasFlow-Web.zip，语义逐项对齐——双重校验（GitHub API digest +
// 清单逐文件 SHA-256）、版本严格高于宿主才启用、staging 原子落位、active.json 指针、
// 启动确认（web-ready 转正）与失败回退随包界面。纯 Node 实现（不依赖 electron），
// 由 main.js 负责路由与 IPC 接线；ZipFile 解压用内置 zlib 自实现，不引入第三方依赖。
const fs = require("fs");
const https = require("https");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const REPO_API = "https://api.github.com/repos/wuxinliuyun-art/canvasflow/releases/latest";
const REPO_LATEST = "https://github.com/wuxinliuyun-art/canvasflow/releases/latest";
const REQUIRED_FILES = ["index.html", "app.js", "styles.css", "canvas-runtime.js", "model-catalog.js"];
const MAX_ZIP_BYTES = 64 * 1024 * 1024;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][A-Za-z0-9.-]+)?$/;

let updateRoot = "";
let versionsRoot = "";
let pointerPath = "";
let bundledRoot = "";
let hostVersion = "";
let activeVersion = "";
let log = () => {};
let releaseCache = null;
let releaseCacheAt = 0;

function init({ dataRoot, bundledRoot: root, hostVersion: version, log: logFn }) {
  bundledRoot = path.resolve(root);
  updateRoot = path.join(path.resolve(dataRoot), "data", "web-updates");
  versionsRoot = path.join(updateRoot, "versions");
  pointerPath = path.join(updateRoot, "active.json");
  hostVersion = String(version || "0.0.0");
  log = typeof logFn === "function" ? logFn : log;
}

function getActiveVersion() {
  return activeVersion;
}

function getCurrentContentRoot() {
  return activeVersion ? versionDirectory(activeVersion) : bundledRoot;
}

// ---------- 版本号规则（与 C# IsNewerVersion / NormalizeVersion 一致） ----------

function normalizeVersion(value) {
  const normalized = String(value ?? "").trim().replace(/^[vV]/, "");
  if (!VERSION_PATTERN.test(normalized)) throw new Error("版本号格式不正确");
  return normalized;
}

function isNewerVersion(candidate, current) {
  const parts = value => String(value ?? "").replace(/^[vV]/, "").split(/[.-]/).filter(Boolean).slice(0, 3)
    .map(part => /^\d+$/.test(part) ? parseInt(part, 10) : 0);
  const next = parts(candidate);
  const now = parts(current);
  for (let index = 0; index < 3; index++) {
    const a = next[index] || 0;
    const b = now[index] || 0;
    if (a !== b) return a > b;
  }
  return false;
}

function tryDigest(value) {
  const digest = String(value ?? "").replace(/^sha256:/i, "").trim();
  return digest.length === 64 && /^[0-9a-f]+$/i.test(digest) ? digest.toLowerCase() : "";
}

// ---------- 指针（与 C# UpdatePointer 同形，System.Text.Json 默认 PascalCase） ----------

function readPointer() {
  try {
    if (!fs.existsSync(pointerPath)) return null;
    return JSON.parse(fs.readFileSync(pointerPath, "utf-8"));
  } catch (error) {
    log(`[界面热更新] 版本指针损坏，将使用内置界面：${error.message}`, true);
    return null;
  }
}

function writePointer(pointer) {
  fs.mkdirSync(updateRoot, { recursive: true });
  const temporary = `${pointerPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({
    ActiveVersion: pointer.activeVersion || "",
    PreviousVersion: pointer.previousVersion || "",
    PendingVersion: pointer.pendingVersion || "",
  }, null, 2), "utf-8");
  fs.renameSync(temporary, pointerPath);
}

function safeChildPath(root, relative) {
  const raw = String(relative ?? "").trim();
  if (!raw || path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) throw new Error("更新包包含非法路径");
  const normalizedRoot = path.resolve(root).replace(/[\\/]+$/, "") + path.sep;
  const resolved = path.resolve(root, raw);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot)) throw new Error("更新包试图写出暂存目录");
  return resolved;
}

function versionDirectory(version) {
  return safeChildPath(versionsRoot, normalizeVersion(version));
}

// ---------- 校验（与 C# ValidateInstalledVersion / ValidateManifestFiles 一致） ----------

function readManifest(directory) {
  const manifestPath = path.join(directory, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("更新包缺少 manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if (!manifest || typeof manifest !== "object") throw new Error("更新清单为空");
  return manifest;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validateManifestFiles(directory, manifest) {
  if (!manifest.version || !manifest.files || typeof manifest.files !== "object") throw new Error("更新清单字段不完整");
  for (const required of REQUIRED_FILES) {
    if (!Object.prototype.hasOwnProperty.call(manifest.files, required)) throw new Error(`更新清单缺少 ${required}`);
  }
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const filePath = safeChildPath(directory, relative);
    if (!fs.existsSync(filePath)) throw new Error(`更新包缺少 ${relative}`);
    const actual = sha256File(filePath);
    if (actual !== String(expected ?? "").replace(/^sha256:/i, "").toLowerCase()) {
      throw new Error(`文件校验失败：${relative}`);
    }
  }
}

function validateInstalledVersion(directory, expectedVersion) {
  const manifest = readManifest(directory);
  if (normalizeVersion(manifest.version) !== normalizeVersion(expectedVersion)) throw new Error("版本目录与清单不一致");
  if (isNewerVersion(manifest.minimumHostVersion, hostVersion)) throw new Error("宿主版本过旧");
  validateManifestFiles(directory, manifest);
}

// ---------- 启动解析（与 C# ResolveContentRoot 一致） ----------

function resolveContentRoot() {
  fs.mkdirSync(versionsRoot, { recursive: true });
  const pointer = readPointer();
  const activeFailedBeforeReady = !!(pointer && pointer.PendingVersion &&
    String(pointer.PendingVersion).toLowerCase() === String(pointer.ActiveVersion || "").toLowerCase());
  if (activeFailedBeforeReady) log(`[界面热更新] ${pointer.ActiveVersion} 上次未完成启动确认，回退到 ${pointer.PreviousVersion}。`, true);
  // 热更新界面必须比宿主新才启用：覆盖安装新版宿主后，旧版残留的热更新界面一律回退随包界面
  const base = activeFailedBeforeReady
    ? [pointer && pointer.PreviousVersion]
    : [pointer && pointer.ActiveVersion, pointer && pointer.PreviousVersion];
  const candidates = base
    .filter(value => value && String(value).trim())
    .filter((value, index, all) => all.findIndex(item => String(item).toLowerCase() === String(value).toLowerCase()) === index)
    .filter(value => isNewerVersion(value, hostVersion));
  for (const version of candidates) {
    const candidate = versionDirectory(version);
    try {
      validateInstalledVersion(candidate, version);
      activeVersion = version;
      if (!pointer || String(pointer.ActiveVersion || "").toLowerCase() !== version.toLowerCase()) {
        writePointer({ activeVersion: version, previousVersion: "" });
      }
      log(`[界面热更新] 使用版本 ${version}。`, false);
      return candidate;
    } catch (error) {
      log(`[界面热更新] 版本 ${version} 无法载入，尝试回退。详细信息：${error.message}`, true);
    }
  }
  activeVersion = "";
  if (pointer) writePointer({ activeVersion: "", previousVersion: "" });
  return bundledRoot;
}

function confirmActiveVersionReady() {
  if (!activeVersion) return;
  const pointer = readPointer();
  if (!pointer || String(pointer.PendingVersion || "").toLowerCase() !== activeVersion.toLowerCase()) return;
  writePointer({ activeVersion: pointer.ActiveVersion, previousVersion: pointer.PreviousVersion });
  log(`[界面热更新] ${activeVersion} 已完成启动确认。`, false);
}

// ---------- minimal zip 解压（central directory + zlib，不支持 zip64/加密） ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function findEocd(buffer) {
  // EOCD 签名 0x06054b50；comment 最长 65535，从文件尾向前扫
  const lowest = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= lowest; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("不是有效的 zip 文件（找不到目录结尾标记）");
}

function extractZip(zipPath, destination) {
  const buffer = fs.readFileSync(zipPath);
  const eocd = findEocd(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (cdOffset === 0xFFFFFFFF || entryCount === 0xFFFF) throw new Error("更新包使用了不支持的 zip64 格式");
  let offset = cdOffset;
  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("更新包目录结构损坏");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const crcExpected = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    // PowerShell Compress-Archive 等写卡器用反斜杠作分隔符（违反 zip 规范），归一化后再判目录/落盘
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf-8").replace(/\\/g, "/");
    if (flags & 0x1) throw new Error(`更新包包含加密条目：${name}`);
    const target = safeChildPath(destination, name);
    if (!name || name.endsWith("/")) {
      fs.mkdirSync(target, { recursive: true });
      offset += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.slice(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) content = Buffer.from(raw);
    else if (method === 8) content = zlib.inflateRawSync(raw);
    else throw new Error(`更新包使用了不支持的压缩方式（${method}）：${name}`);
    if (content.length !== uncompressedSize) throw new Error(`更新包内容长度不符：${name}`);
    if (crc32(content) !== crcExpected) throw new Error(`更新包内容损坏：${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

// ---------- 网络下载（对齐 C# HttpClient：仅 github.com 入口、自动重定向、5 分钟超时、64MB 上限） ----------

function fetchZip(url, zipPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { "User-Agent": `CanvasFlow/${hostVersion}` },
      timeout: 5 * 60 * 1000,
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        fetchZipCount++;
        if (fetchZipCount > 5) { reject(new Error("热更新下载重定向次数过多")); return; }
        resolve(fetchZip(new URL(response.headers.location, url).toString(), zipPath));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`热更新包下载失败：HTTP ${response.statusCode}`));
        return;
      }
      const declared = Number(response.headers["content-length"] || 0);
      if (declared > MAX_ZIP_BYTES) { reject(new Error("热更新包超过 64MB 限制")); return; }
      const output = fs.createWriteStream(zipPath, { flags: "wx" });
      let received = 0;
      let failed = false;
      response.on("data", chunk => {
        received += chunk.length;
        if (received > MAX_ZIP_BYTES && !failed) {
          failed = true;
          request.destroy(new Error("热更新包超过 64MB 限制"));
          output.destroy();
          reject(new Error("热更新包超过 64MB 限制"));
        }
      });
      response.pipe(output);
      output.on("finish", () => { if (!failed) resolve(); });
      output.on("error", error => { if (!failed) { failed = true; reject(error); } });
    });
    request.on("timeout", () => request.destroy(new Error("热更新包下载超时，请检查网络后重试")));
    request.on("error", error => reject(error));
  });
}

let fetchZipCount = 0;

function downloadTo(url, zipPath) {
  fetchZipCount = 0;
  return fetchZip(url, zipPath);
}

// ---------- 下载并应用（与 C# DownloadAndApplyAsync 一致） ----------

async function downloadAndApply({ url, digest, expectedVersion }) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ""));
  } catch { parsed = null; }
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com") {
    throw new Error("热更新下载地址不是受信任的 GitHub HTTPS 地址");
  }
  const expectedDigest = tryDigest(digest);
  if (!expectedDigest) throw new Error("热更新包缺少 GitHub SHA-256 校验值，请改用完整安装包");

  fs.mkdirSync(updateRoot, { recursive: true });
  const operationId = `${process.pid}-${Date.now()}`;
  const zipPath = path.join(updateRoot, `download-${operationId}.zip`);
  const staging = path.join(updateRoot, "staging", operationId);
  try {
    await downloadTo(parsed.toString(), zipPath);
    if (fs.statSync(zipPath).size > MAX_ZIP_BYTES) throw new Error("热更新包超过 64MB 限制");
    const actualDigest = sha256File(zipPath);
    if (actualDigest !== expectedDigest) throw new Error("热更新包 SHA-256 校验失败");

    fs.mkdirSync(staging, { recursive: true });
    extractZip(zipPath, staging);
    const manifest = readManifest(staging);
    if (normalizeVersion(manifest.version) !== normalizeVersion(expectedVersion)) {
      throw new Error(`热更新清单版本 ${manifest.version} 与 Release ${expectedVersion} 不一致`);
    }
    if (isNewerVersion(manifest.minimumHostVersion, hostVersion)) {
      throw new Error(`此界面需要宿主 ${manifest.minimumHostVersion}，当前宿主 ${hostVersion}；请安装完整新版`);
    }
    validateManifestFiles(staging, manifest);

    const version = normalizeVersion(manifest.version);
    const destination = versionDirectory(version);
    if (fs.existsSync(destination)) {
      validateInstalledVersion(destination, version);
      fs.rmSync(staging, { recursive: true, force: true });
    } else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      try {
        fs.renameSync(staging, destination);
      } catch (renameError) {
        if (renameError.code !== "EXDEV") throw renameError;
        fs.cpSync(staging, destination, { recursive: true });
        fs.rmSync(staging, { recursive: true, force: true });
      }
    }
    const pointer = readPointer();
    const previous = (pointer && pointer.ActiveVersion) || activeVersion || "";
    writePointer({ activeVersion: version, previousVersion: previous, pendingVersion: version });
    activeVersion = version;
    log(`[界面热更新] 已安装并切换到 ${version}，上个版本为 ${previous}。`, false);
    return { applied: true, version, contentRoot: destination, previousVersion: previous };
  } catch (error) {
    log(`[界面热更新] 更新失败，当前版本保持不变。详细信息：${error.message}`, true);
    throw new Error(`界面更新没有完成。可能原因：网络中断、更新包损坏或宿主版本过旧。建议：重试，或下载完整安装包。详细信息：${error.message}`);
  } finally {
    try { if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true }); } catch { }
    try { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); } catch { }
  }
}

// ---------- 检查更新（对齐 DesktopApi.CheckForUpdatesAsync，含 10 分钟缓存与 302 回退） ----------

function githubJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, timeout: 20000 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`GitHub返回HTTP ${response.statusCode}`)); return; }
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
        catch (error) { reject(error); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("连接 GitHub 超时")));
    request.on("error", reject);
  });
}

function releaseDownloadUrl(tag, name) {
  return `${REPO_LATEST.replace("/releases/latest", "")}/releases/download/${encodeURIComponent(tag)}/${name}`;
}

async function checkForUpdates() {
  if (releaseCache && Date.now() - releaseCacheAt < 10 * 60 * 1000) return releaseCache;
  let info;
  try {
    const release = await githubJson(REPO_API, {
      "User-Agent": `CanvasFlow/${hostVersion}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const setupAssets = assets.filter(asset => /^CanvasFlow-Setup\.exe$/i.test(asset.name || ""));
    if (setupAssets.length !== 1) throw new Error(`最新Release应包含且只包含一个CanvasFlow-Setup.exe，当前检测到${setupAssets.length}个`);
    const asset = setupAssets[0];
    const webAssets = assets.filter(item => /^CanvasFlow-Web\.zip$/i.test(item.name || ""));
    if (webAssets.length > 1) throw new Error(`最新Release最多包含一个CanvasFlow-Web.zip，当前检测到${webAssets.length}个`);
    const webAsset = webAssets[0] || null;
    const tag = String(release.tag_name || release.name || "");
    info = {
      latestVersion: tag.replace(/^[vV]/, ""),
      releaseName: release.name || release.tag_name || tag,
      notes: release.body || "",
      pageUrl: release.html_url || REPO_LATEST,
      asset: { name: asset.name || "CanvasFlow-Setup.exe", size: asset.size || 0, url: asset.browser_download_url || "", digest: asset.digest || "" },
      webAsset: webAsset ? { name: webAsset.name || "CanvasFlow-Web.zip", size: webAsset.size || 0, url: webAsset.browser_download_url || "", digest: webAsset.digest || "" } : null,
      fallback: false,
    };
  } catch (apiError) {
    log(`[更新检查] GitHub API不可用，改用公开Release地址：${apiError.message}`, true);
    const location = await new Promise((resolve, reject) => {
      const request = https.get(REPO_LATEST, { headers: { "User-Agent": `CanvasFlow/${hostVersion}` }, timeout: 20000 }, response => {
        response.resume();
        resolve(response.headers.location || "");
      });
      request.on("timeout", () => request.destroy(new Error("连接 GitHub 超时")));
      request.on("error", reject);
    });
    const match = String(location).match(/\/releases\/tag\/([^/?#]+)/i);
    if (!match) throw apiError;
    const tag = decodeURIComponent(match[1]);
    info = {
      latestVersion: tag.replace(/^[vV]/, ""),
      releaseName: tag,
      notes: "",
      pageUrl: new URL(location, REPO_LATEST).toString(),
      asset: { name: "CanvasFlow-Setup.exe", size: 0, url: releaseDownloadUrl(tag, "CanvasFlow-Setup.exe"), digest: "" },
      webAsset: null,
      fallback: true,
    };
  }
  const displayedVersion = activeVersion || hostVersion;
  releaseCache = {
    currentVersion: info.fallback ? hostVersion : displayedVersion,
    latestVersion: info.latestVersion,
    releaseName: info.releaseName,
    notes: info.notes,
    pageUrl: info.pageUrl,
    hasUpdate: isNewerVersion(info.latestVersion, info.fallback ? hostVersion : displayedVersion),
    canAutoInstall: !!(info.asset && info.asset.digest),
    canHotUpdate: !!(info.webAsset && info.webAsset.digest),
    asset: info.asset,
    webAsset: info.fallback ? null : info.webAsset,
  };
  releaseCacheAt = Date.now();
  return releaseCache;
}

// 对齐 DesktopApi.ApplyLatestWebUpdateAsync：缓存取参数（过期先刷新）、apply 后修正缓存状态
async function applyLatestWebUpdate() {
  const release = releaseCache && Date.now() - releaseCacheAt < 10 * 60 * 1000
    ? releaseCache
    : await checkForUpdates();
  const webAsset = release && release.webAsset;
  if (!webAsset) throw new Error("当前 Release 没有可用的界面热更新包，请下载完整安装包");
  const result = await downloadAndApply({ url: webAsset.url, digest: webAsset.digest, expectedVersion: release.latestVersion });
  if (releaseCache) {
    releaseCache.currentVersion = activeVersion;
    releaseCache.hasUpdate = false;
  }
  return result;
}

module.exports = {
  init,
  resolveContentRoot,
  confirmActiveVersionReady,
  downloadAndApply,
  applyLatestWebUpdate,
  checkForUpdates,
  get activeVersion() { return activeVersion; },
  get currentContentRoot() { return getCurrentContentRoot(); },
  // 供构建脚本与测试复用的纯工具
  normalizeVersion,
  isNewerVersion,
  extractZip,
  sha256File,
  safeChildPath,
};
