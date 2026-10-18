"use strict";

const ps = require("photoshop");
const { storage, entrypoints } = require("uxp");
const { createTransport } = require("./transport.js");
const { createExporter } = require("./photoshop.js");
const manifest = require("./manifest.json");
const store = {
  get(key) { return localStorage.getItem("cfuxp_" + key) || ""; },
  set(key, value) { localStorage.setItem("cfuxp_" + key, value); },
};
const transport = createTransport({ fs: storage.localFileSystem, store });
const exportPng = createExporter(ps, storage);
let busy = false;
let initialized = false;
let probeSequence = 0;
const $ = id => document.getElementById(id);

function theme() {
  document.body.classList.toggle("theme-dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function documentInfo() {
  try {
    const doc = ps.app.activeDocument;
    $("docInfo").textContent = doc ? doc.name + " · " + doc.width + " × " + doc.height : "PS 中没有打开的文档";
  } catch (_) { $("docInfo").textContent = "暂时无法读取文档，请关闭 PS 对话框后重试"; }
}
function setBusy(value, label = "正在回传…") {
  busy = value;
  for (const id of ["sendMerged", "sendLayer", "chooseBridge", "reconnect", "serverUrl"]) $(id).disabled = value;
  $("sendMerged").textContent = value ? label : "合并图层 → 画布";
}
function message(text, error = false) {
  $("log").textContent = text;
  $("log").className = error ? "error" : "";
}
async function reconnect() {
  const seq = ++probeSequence;
  $("connection").textContent = "正在检测连接…";
  try {
    const target = await transport.connect();
    if (seq === probeSequence) $("connection").textContent = "已连接：" + target.base;
  } catch (error) {
    if (seq === probeSequence) $("connection").textContent = error.message;
  }
}
async function send(kind) {
  if (busy) return;
  ++probeSequence;
  setBusy(true);
  message("正在连接画布…");
  try {
    // Resolve anew, so a restarted desktop never receives yesterday's credentials.
    const target = await transport.connect();
    $("connection").textContent = "已连接：" + target.base;
    message("正在导出 PNG…");
    const payload = await exportPng(kind);
    message("正在回传画布…");
    await transport.send(target, payload);
    message("已回传：" + payload.name + "。请在画布中查看新图片节点。");
  } catch (error) {
    message("回传失败：" + error.message + "。若请求超时，请先检查画布是否已收到图片再重试。", true);
  } finally {
    setBusy(false);
    documentInfo();
  }
}
function init() {
  if (initialized) return;
  initialized = true;
  $("version").textContent = "v" + manifest.version;
  $("serverUrl").value = store.get("serverUrl");
  $("sendMerged").addEventListener("click", () => send("merged"));
  $("sendLayer").addEventListener("click", () => send("layer"));
  $("serverUrl").addEventListener("change", () => {
    store.set("serverUrl", $("serverUrl").value.trim());
    reconnect();
  });
  $("reconnect").addEventListener("click", reconnect);
  $("chooseBridge").addEventListener("click", async () => {
    if (busy) return;
    setBusy(true, "正在连接…");
    try {
      if (await transport.chooseBridge()) {
        $("serverUrl").value = "";
        message("已记住桥接文件授权");
        await reconnect();
      }
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  if (typeof media.addEventListener === "function") media.addEventListener("change", theme);
  else if (typeof media.addListener === "function") media.addListener(theme);
  theme();
  documentInfo();
  reconnect();
}
entrypoints.setup({ panels: { canvasflowTransfer: {
  show() { init(); documentInfo(); theme(); },
} } });
