const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("// 浏览器生图结果的右键交互（移植自个人 v2.7.8 快照）");
const end = source.indexOf("function nodeTemplate", start);
assert.ok(start >= 0 && end > start, "browser result menu block should exist in app.js");

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6l8AAAAASUVORK5CYII=";

function fixture(nodeFields = {}, options = {}) {
  const node = { id: "br-1", type: "browser-image", generatedImage: png, ...nodeFields };
  const calls = { fetches: [], saved: null, cleared: 0, opened: [], copied: [], toasts: [], history: 0, renders: 0 };
  const context = {
    state: { settings: { exportFolderLabel: "" } },
    currentPage: () => ({ name: "项目A" }),
    projectExportFileName: (fileName, projectName) => fileName,
    fetchImageAsBase64: async url => (options.fetchFails ? Promise.reject(new Error("下载失败")) : url.startsWith("data:") ? url : png),
    apiFetch: async (url, init) => {
      calls.fetches.push({ url, body: init ? JSON.parse(init.body) : null });
      if (options.saveFails) return { ok: false, status: 500, json: async () => ({ error: "磁盘已满" }) };
      return { ok: true, status: 200, json: async () => ({ files: ["/data/export/browser_generated/br.png"], path: "/data/export/browser_generated" }) };
    },
    openGeneratedFileLocation: async n => { calls.opened.push(n.outputPath); },
    copyTextValue: async v => { calls.copied.push(v); },
    toast: t => { calls.toasts.push(t); },
    pushHistory: () => { calls.history++; },
    render: () => { calls.renders++; },
    console: { error() {}, warn() {} },
  };
  vm.runInNewContext(
    source.slice(start, end)
    + "\nthis.resultImage = browserResultImageNode; this.menuItems = browserResultContextMenuItems; this.clearResult = clearBrowserImageResult; this.saveToExport = saveBrowserResultToExport;",
    context
  );
  return { context, node, calls };
}

test("结果视图只暴露图片语义字段，非结果节点返回 null", () => {
  const { context, node } = fixture({ outputPath: "/data/export/a.png", fileName: "br.png" });
  const view = context.resultImage(node);
  assert.equal(view.type, "image");
  assert.equal(view.image, png);
  assert.equal(view.outputPath, undefined, "合成视图不携带节点任务字段");
  assert.equal(context.resultImage({ type: "browser-image" }), null);
  assert.equal(context.resultImage({ type: "text", text: "x" }), null);
});

test("未落盘时菜单提供保存入口而非打开动作；落盘后提供打开与复制路径", () => {
  const bare = fixture({});
  assert.deepEqual(Array.from(bare.context.menuItems(bare.node), i => i[0]), ["保存生成结果到导出文件夹", "清除生成结果"]);
  const saved = fixture({ outputPath: "/data/export/browser_generated/br.png" });
  assert.deepEqual(Array.from(saved.context.menuItems(saved.node), i => i[0]), ["复制生成结果文件路径", "清除生成结果"]);
  assert.equal(saved.context.menuItems({ type: "browser-image" }).length, 0, "无结果时无右键项");
});

test("保存走导出 API 并把服务端返回路径写回节点；保存后可直接打开", async () => {
  const { context, node, calls } = fixture({});
  await context.saveToExport(node, true);
  assert.equal(calls.fetches.length, 1);
  assert.equal(calls.fetches[0].url, "/api/save-export-files");
  assert.equal(calls.fetches[0].body.folderName, "browser_generated");
  assert.match(calls.fetches[0].body.files[0].name, /^browser-result-\d{8}-\d{6}\.png$/);
  assert.equal(node.outputPath, "/data/export/browser_generated/br.png");
  assert.equal(calls.history, 1);
  assert.deepEqual(calls.opened, ["/data/export/browser_generated/br.png"]);
});

test("保存失败不写路径、不清除结果，并给出可读提示", async () => {
  const { context, node, calls } = fixture({}, { saveFails: true });
  await context.saveToExport(node);
  assert.equal(node.outputPath, undefined);
  assert.equal(node.generatedImage, png, "失败不丢结果");
  assert.equal(calls.history, 0);
  assert.match(calls.toasts.at(-1), /磁盘已满/);
});

test("清除结果只清节点字段，不触发任何文件删除", async () => {
  const { context, node, calls } = fixture({ generatedAssetId: "asset-1", generationPrompt: "旧词", outputPath: "/data/export/a.png" });
  context.clearResult(node);
  assert.equal(node.generatedImage, null);
  assert.equal(node.generatedAssetId, undefined);
  assert.equal(node.generationPrompt, undefined);
  assert.equal(node.outputPath, "/data/export/a.png", "已落盘文件路径保留，文件不删除");
  assert.equal(calls.history, 1);
});

test("URL 形态的结果先经 fetchImageAsBase64 转换再落盘", async () => {
  const { context, node, calls } = fixture({ generatedImage: "http://127.0.0.1:5331/download/images/x.png" });
  await context.saveToExport(node);
  assert.equal(calls.fetches[0].body.files[0].data, png, "发送给导出 API 的是 dataURL");
});
