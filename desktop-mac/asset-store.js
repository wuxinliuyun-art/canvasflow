// 素材仓库：移植 Windows 桌面版 MainWindow 的 data\assets 素材管线。
// 图片按内容 SHA-256 为 id 去重落盘（originals/generated 子目录），index.json 保存元数据；
// 前端 state 只保留缩略图与 assetId（externalizeImageField），大图读取走 readAsset。
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EXT_BY_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);
const MAX_BYTES = 64 * 1024 * 1024;

let assetsDirectory = "";
let indexPath = "";
const assets = new Map();

function init(dataRoot) {
  assetsDirectory = path.join(dataRoot, "data", "assets");
  indexPath = path.join(assetsDirectory, "index.json");
  fs.mkdirSync(assetsDirectory, { recursive: true });
  loadIndex();
}

function loadIndex() {
  if (!fs.existsSync(indexPath)) return;
  try {
    const saved = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    for (const [id, record] of Object.entries(saved || {})) {
      if (!/^[a-f0-9]{64}$/i.test(id)) continue;
      try {
        const full = safeAssetPath(record.relativePath || record.RelativePath || "");
        if (fs.existsSync(full)) assets.set(id.toLowerCase(), normalizeRecord(id, record));
      } catch (_) { /* 越界路径丢弃 */ }
    }
  } catch (error) {
    console.warn(`[素材仓库] 读取索引失败（索引文件可能损坏）：${error.message}`);
  }
}

function normalizeRecord(id, record) {
  return {
    id,
    fileName: record.fileName ?? record.FileName ?? "",
    mime: record.mime ?? record.Mime ?? "image/png",
    relativePath: record.relativePath ?? record.RelativePath ?? "",
    size: Number(record.size ?? record.Size ?? 0),
  };
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
}

function saveIndex() {
  fs.mkdirSync(assetsDirectory, { recursive: true });
  const snapshot = {};
  for (const [id, record] of assets) snapshot[id] = record;
  atomicWriteJson(indexPath, snapshot);
}

function safeAssetPath(relativePath) {
  const normalized = String(relativePath || "").split(/[\\/]+/).filter(part => part && part !== "." && part !== "..");
  const full = path.join(assetsDirectory, ...normalized);
  const root = path.resolve(assetsDirectory);
  if (!full.startsWith(root + path.sep)) throw new Error("素材路径越界");
  return full;
}

function storeImageData(dataUrl, fileName, category = "originals") {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/is.exec(String(dataUrl || ""));
  if (!match) throw new Error("图片数据格式无效");
  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_BYTES) throw new Error("单张图片超过64MB限制");
  return storeAssetBytes(bytes, path.basename(String(fileName || "image")), mime, category === "generated" ? "generated" : "originals");
}

function storeAssetBytes(bytes, fileName, mime, category) {
  const ext = EXT_BY_MIME.get(mime);
  if (!ext) throw new Error("图片格式不受支持");
  const id = crypto.createHash("sha256").update(bytes).digest("hex");
  const existing = assets.get(id);
  if (existing) return existing;
  const relativePath = path.join(category, id + ext);
  const destination = safeAssetPath(relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
  const record = { id, fileName, mime, relativePath: relativePath.split(path.sep).join("/"), size: bytes.length };
  assets.set(id, record);
  saveIndex();
  return record;
}

function getAsset(id) {
  const record = assets.get(String(id || "").toLowerCase());
  if (!record) throw Object.assign(new Error("素材不存在，可能已被移动或删除"), { code: "ENOASSET" });
  return record;
}

function readAsset(assetId) {
  const record = getAsset(assetId);
  const filePath = safeAssetPath(record.relativePath);
  const bytes = fs.readFileSync(filePath);
  return { dataUrl: `data:${record.mime};base64,${bytes.toString("base64")}`, fileName: record.fileName, mime: record.mime };
}

function assetFilePath(assetId) {
  const record = getAsset(assetId);
  return safeAssetPath(record.relativePath);
}

module.exports = { init, storeImageData, readAsset, assetFilePath, safeAssetPath };
