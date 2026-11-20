"use strict";
// 拖图放回 AI 绘图节点内部预览（2026-11-20，用户演示截图需求）：
// ① 画布图片节点拖到空结果的 AI 绘图节点上松开 → 图片进节点内部预览槽（generatedImage），外部图片节点删除；
// ② 图片文件拖到 AI 绘图节点上 → 第一张进内部预览，多余图片照旧建图片节点。
// 已否决方案（自动建图片节点并连线当参考图）不得复活；已有结果的 AI 节点保持叠放编辑语义。
// app.js 为 CRLF 行尾：跨行结构用单行正则断言，不内嵌 \n。
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const app = readFileSync(path.join(root, "app.js"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");

test("空结果 AI 节点判定：ai-image + 生成中不收 + 无内置结果", () => {
  assert.match(app, /function aiPreviewInjectTarget\(target\) \{/);
  assert.match(app, /target\?\.type === "ai-image" && !target\.generating && !nodeImageReference\(target\)/);
});

test("悬停判定：图片源可把空 AI 节点作为置入目标，不受叠放编辑开关影响", () => {
  assert.match(app, /const aiInjectMode = source\.type === "image" && Boolean\(nodeImageReference\(source\)\);/);
  assert.match(app, /!nodeImageReference\(target\) && !aiPreviewInjectTarget\(target\)/);
  assert.match(app, /if \(!textMergeMode && !imageMode && !aiInjectMode\) return clearCompositeHover\(\);/);
});

test("释放分发：注入分支在文字合并与叠放编辑之间", () => {
  assert.match(app, /aiInject: source\.type === "image" && aiPreviewInjectTarget\(target\)/);
  const inject = app.indexOf("void injectImageIntoAiNode(compositeRequest.target, compositeRequest.source)");
  const merge = app.indexOf("mergeTextNodeTexts(compositeRequest.target, compositeRequest.source)");
  const editor = app.indexOf("void openNodeCompositeEditor(compositeRequest.target, compositeRequest.source)");
  assert.ok(inject > -1 && merge > -1 && editor > -1);
  assert.ok(merge < inject && inject < editor, "分发顺序必须是 合并→注入→叠放编辑");
});

test("注入实现：写 generatedImage 槽位并外部化，清空旧产物痕迹", () => {
  assert.match(app, /async function injectImageIntoAiPreview\(target, payload\) \{/);
  assert.match(app, /target\.generatedImage = payload\.image;/);
  assert.match(app, /delete target\.generatedAssetId;/);
  assert.match(app, /delete target\.generationPrompt;/);
  assert.match(app, /delete target\.outputPath;/);
  assert.match(app, /await externalizeImageField\(target, "generatedImage", "generatedAssetId", target\.fileName\);/);
});

test("节点拖入注入：取素材仓库原图、删除外部图片节点与连线、可撤销", () => {
  assert.match(app, /const image = await materializeReferenceImage\(reference\);/);
  assert.match(app, /state\.nodes = state\.nodes\.filter\(node => node\.id !== source\.id\);/);
  assert.match(app, /state\.edges = state\.edges\.filter\(edge => edge\.from\.node !== source\.id && edge\.to\.node !== source\.id\);/);
  assert.match(app, /已把图片放回 AI 节点内部（Ctrl\+Z 可撤销）|已把图片放回 AI 节点内部/);
});

test("文件拖入：第一张进 AI 节点内部预览，多余图片照旧建图片节点", () => {
  assert.match(app, /const targetAiEl = ev\.target\.closest\("\.node\.ai-image"\);/);
  assert.match(app, /await injectImageIntoAiPreview\(aiNode, sources\[0\]\);/);
  assert.match(app, /const rest = sources\.slice\(1\);/);
});

test("已否决的自动连线方案不得复活", () => {
  assert.ok(!app.includes("已置入参考图并连线到 AI 节点"), "参考图自动连线方案已被用户否决并回退");
  assert.ok(!app.includes("已置入参考图并连线"), "参考图自动连线方案已被用户否决并回退");
  assert.ok(!app.includes("const baseX = aiNode.x - (NODE_WIDTH + 40)"), "左列参考图布局不得复活");
});

test("叠放编辑语义保持：有结果的 AI 节点仍走合成编辑器", () => {
  // 有 generatedImage/generatedAssetId 时 nodeImageReference(target) 为真,不走注入分支
  assert.match(app, /void openNodeCompositeEditor\(compositeRequest\.target, compositeRequest\.source\);/);
  assert.match(app, /if \(textMergeMode \? \(target\.type !== "text"\) : \(!nodeImageReference\(target\) && !aiPreviewInjectTarget\(target\)\)\) continue;/);
});

test("?v= 基线：app.js 与 styles.css 为当日已递增版本（并行会话共享版本线）", () => {
  assert.match(html, /app\.js\?v=20261120-[a-z0-9]+/);
  assert.match(html, /styles\.css\?v=20261120-[a-z0-9]+/);
});
