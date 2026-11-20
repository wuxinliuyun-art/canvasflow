"use strict";
// 还原图作流程（2026-11-20）：生成落盘时把参考图内容哈希清单(CanvasFlow.References)+模型(CanvasFlow.Model)
// 写进 PNG iTXt,结果节点打 hasWorkflowMeta 标记;右键「还原作图流程」只在带清单时显示(用户明确要求),
// 还原时从素材仓库按哈希取回原图,重建 参考图们+关键词文字节点+新 AI 节点 的链路,不自动生成。
// app.js 为 CRLF 行尾:跨行结构用单行正则断言,不内嵌 \n;vm 切片含多个顶层声明不能括号包裹。
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const app = readFileSync(path.join(root, "app.js"), "utf8");

function sliceHelper() {
  const start = app.indexOf("function workflowMetaForTask");
  const end = app.indexOf("// 勾选\"以项目名称创建文件夹导出\"");
  assert.ok(start > -1 && end > start, "工作流元数据助手切片边界定位失败");
  const context = { JSON, String, Array, console };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  return context;
}

test("workflowMetaForTask：标准 AI 任务产出 去重参考图清单+模型", () => {
  const { workflowMetaForTask } = sliceHelper();
  const task = {
    orderedImages: [{ assetId: "aaa" }, { assetId: "bbb" }, { assetId: "aaa" }],
    generationSettings: { _model: "gpt-image-2.5-flare" },
  };
  const meta = workflowMetaForTask(task, { type: "ai-image" });
  assert.ok(meta);
  assert.equal(meta.references, JSON.stringify(["aaa", "bbb"]));
  assert.equal(meta.model, "gpt-image-2.5-flare");
});

test("workflowMetaForTask：组图任务按 regularImages+groupImage 收集", () => {
  const { workflowMetaForTask } = sliceHelper();
  const meta = workflowMetaForTask(
    { regularImages: [{ assetId: "r1" }], groupImage: { assetId: "g1" }, generationSettings: {} },
    { type: "ai-image" }
  );
  assert.equal(meta.references, JSON.stringify(["r1", "g1"]));
});

test("workflowMetaForTask：抠图/截图/角度节点/无 assetId 一律不产出（菜单隐藏依据）", () => {
  const { workflowMetaForTask } = sliceHelper();
  assert.equal(workflowMetaForTask({ localMatting: true, orderedImages: [{ assetId: "x" }] }, { type: "ai-image" }), null);
  assert.equal(workflowMetaForTask({ source: "screenshot", orderedImages: [{ assetId: "x" }] }, { type: "ai-image" }), null);
  assert.equal(workflowMetaForTask({ orderedImages: [{ assetId: "x" }] }, { type: "angle-image" }), null);
  assert.equal(workflowMetaForTask({ orderedImages: [{ image: "data:image/png;base64,x" }] }, { type: "ai-image" }), null);
});

test("workflowReferencesFromMeta：合法/非法/非数组/去重", () => {
  const { workflowReferencesFromMeta } = sliceHelper();
  // vm 跨 realm 数组原型与主 realm 不同,deepStrictEqual 会误判,统一用 JSON.stringify 比较
  const run = input => JSON.stringify(workflowReferencesFromMeta(input));
  assert.equal(run({ "CanvasFlow.References": '["a","b","a"]' }), JSON.stringify(["a", "b"]));
  assert.equal(run({ "CanvasFlow.References": "not-json" }), "[]");
  assert.equal(run({ "CanvasFlow.References": '{"x":1}' }), "[]");
  assert.equal(run({}), "[]");
  assert.equal(run({ "CanvasFlow.References": '["  a ", "", "a"]' }), JSON.stringify(["a"]));
});

test("applyQueuedResult：写入 References/Model 元数据并在两类结果节点上打 hasWorkflowMeta", () => {
  assert.match(app, /const workflow = workflowMetaForTask\(task, node\);/);
  assert.match(app, /meta\["CanvasFlow\.References"\] = workflow\.references;/);
  assert.match(app, /meta\["CanvasFlow\.Model"\] = workflow\.model;/);
  assert.match(app, /if \(workflow\) node\.hasWorkflowMeta = true; else delete node\.hasWorkflowMeta;/);
  assert.match(app, /if \(workflow\) resultNode\.hasWorkflowMeta = true;/);
});

test("右键菜单：只在 hasWorkflowMeta 时显示，且不支持角度节点", () => {
  assert.match(app, /function generationWorkflowMenuItems\(node\) \{/);
  assert.match(app, /const supported = \["image", "ai-image"\]\.includes\(node\?\.type\);/);
  assert.match(app, /return supported && node\?\.hasWorkflowMeta === true \? \[\["还原作图流程", \(\) => restoreAiWorkflowFromNode\(node\)\]\] : \[\];/);
  assert.match(app, /\.\.\.generationWorkflowMenuItems\(selectedNode\),/);
});

test("还原实现：按哈希从素材仓库取原图、重建链路、校验模型、不自动生成", () => {
  assert.match(app, /async function restoreAiWorkflowFromNode\(node\) \{/);
  assert.match(app, /const assetBridge = window\.canvasflowDesktop \|\| desktop;/);
  assert.match(app, /if \(!assetBridge\?\.readAsset\) return toast\("还原参考图需要桌面版素材仓库；当前运行方式无法取回原图"\);/);
  assert.match(app, /const refs = workflowReferencesFromMeta\(meta\);/);
  assert.match(app, /if \(model && modelCatalogEntry\(model\)\) aiNode\._model = model;/);
  assert.match(app, /to: \{ node: aiNode\.id, port: "in" \}, label: "" \}/);
  assert.match(app, /AI 节点未自动生成/);
  const fnStart = app.indexOf("async function restoreAiWorkflowFromNode");
  const fnEnd = app.indexOf("async function extractGenerationKeywords", fnStart);
  assert.ok(!app.slice(fnStart, fnEnd).includes("enqueueAiNode("), "还原流程不得自动入队生成");
});

test("预览置入：注入带清单的图点亮 hasWorkflowMeta，否则熄灭", () => {
  assert.match(app, /if \(workflowReferencesFromMeta\(readGenerationMetadataFromPng\(payload\.image\) \|\| \{\}\)\.length\) target\.hasWorkflowMeta = true;/);
  assert.match(app, /else delete target\.hasWorkflowMeta;/);
});
