"use strict";
// 编组菜单精简（2026-11-20 用户要求）：
// ① 编组中的节点右键只保留「取消编组」，收纳/重命名编组从节点菜单移除（走编组外框头部按钮与外框右键）；
// ② 编组外框头部「收纳」左边新增「取消编组」按钮；
// ③ 「打开生成图片所在文件夹」在节点菜单中向下挪一位（换到「在 PS 中编辑」之后）。
// app.js 为 CRLF 行尾：断言用单行正则/字符串定位，不内嵌 \n。
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const app = readFileSync(path.join(root, "app.js"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");

test("节点右键菜单：收纳/重命名编组已移除，只留取消编组", () => {
  assert.ok(!app.includes("selectedGroupIds"), "单节点菜单的编组段辅助变量应随收纳/重命名项一起删除");
  assert.ok(!app.includes('[[canvasGroupIsCollapsed(selectedGroupIds[0])'), "节点菜单不得再提供收纳/展开编组");
  assert.ok(!app.includes('[["重命名编组", () => beginCanvasGroupRename(selectedGroupIds[0])]]'), "节点菜单不得再提供重命名编组");
  assert.match(app, /\[\["取消编组", \(\) => ungroupCanvasSelection\(\)\]\]/);
});

test("编组外框右键菜单保留完整三项（收纳/重命名/取消）", () => {
  assert.match(app, /\["重命名编组", \(\) => beginCanvasGroupRename\(groupId\)\]/);
  const frameMenu = app.indexOf('const frameEl = ev.target.closest(".node-group-frame")');
  const ungroup = app.indexOf('["取消编组", () => ungroupCanvasSelection()]', frameMenu);
  assert.ok(ungroup > -1, "外框右键菜单保留取消编组");
});

test("编组头部：取消编组按钮在收纳按钮左边", () => {
  const ungroupBtn = app.indexOf('data-group-action="ungroup"');
  const collapseBtn = app.indexOf('data-group-action="${collapsed ? "expand" : "collapse"}"');
  assert.ok(ungroupBtn > -1 && collapseBtn > -1);
  assert.ok(ungroupBtn < collapseBtn, "取消编组按钮必须渲染在收纳按钮之前");
  assert.match(app, /else if \(action === "ungroup"\) \{/);
  assert.match(app, /state\.selected = new Set\(canvasGroupMembers\(groupFrame\.dataset\.groupId\)\.map\(node => node\.id\)\);/);
  assert.match(app, /ungroupCanvasSelection\(\);/);
});

test("「打开生成图片所在文件夹」移到「在 PS 中编辑」之后", () => {
  const psAi = app.indexOf('(selectedNode?.type === "ai-image" || selectedNode?.type === "angle-image") && (selectedNode?.generatedAssetId || selectedNode?.outputPath) ? [["在 PS 中编辑"');
  const folder = app.indexOf('[["打开生成图片所在文件夹", () => openGeneratedFileLocation(selectedNode)]]');
  assert.ok(psAi > -1 && folder > -1);
  assert.ok(folder > psAi, "打开生成图片所在文件夹必须在 PS 编辑项之后（向下挪一位）");
});

test("?v= 基线：app.js 为当日已递增版本（并行会话共享版本线）", () => {
  assert.match(html, /app\.js\?v=20261120-[a-z0-9]+/);
});
