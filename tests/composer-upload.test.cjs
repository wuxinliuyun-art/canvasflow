// 底部输入条上传按钮（2026-11-27 用户要求）：点击直接打开系统文件对话框（input[multiple] 原生支持
// Ctrl/Shift 加选，多选后各自生成图片节点）；文件夹上传收进按钮右键（桌面壳桥 / webkitdirectory 双路径保留）。
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("上传按钮点击直接打开文件对话框，不再弹二级菜单", () => {
  const start = app.indexOf("els.composerUploadBtn.onclick");
  const end = app.indexOf("els.composerUploadBtn.oncontextmenu");
  assert.ok(start > 0 && end > start, "上传按钮接线缺失");
  const block = app.slice(start, end);
  assert.ok(block.includes("els.composerFileInput.click()"), "点击应直接触发文件对话框");
  assert.ok(!block.includes("showMenu"), "点击路径不得再弹菜单");
  assert.ok((html.match(/id="composerFileInput"[^>]*multiple/) || []).length === 1, "文件 input 必须保持 multiple（Ctrl 加选的前提）");
});

test("文件夹上传移至按钮右键，桌面壳桥与浏览器路径保留", () => {
  const start = app.indexOf("els.composerUploadBtn.oncontextmenu");
  const end = app.indexOf("els.composerFileInput.onchange");
  assert.ok(start > 0 && end > start, "右键接线缺失");
  const block = app.slice(start, end);
  assert.ok(block.includes("上传图片文件夹"), "右键菜单应含文件夹上传");
  assert.ok(block.includes('postMessage({ type: "pick-image-folder" })'), "桌面壳桥路径保留");
  assert.ok(block.includes("els.composerFolderInput.click()"), "浏览器 webkitdirectory 路径保留");
});

test("按钮提示与可访问性：title 说明多选与右键，icon 按钮带 aria-label（UI-SPEC）", () => {
  const tag = html.match(/<button id="composerUploadBtn"[^>]*>/)?.[0] || "";
  assert.ok(tag.includes("Ctrl 多选"), "title 应说明可 Ctrl 多选");
  assert.ok(tag.includes("右键上传文件夹"), "title 应说明右键入口");
  assert.ok(tag.includes('aria-label="上传图片"'), "图标按钮必须带 aria-label");
  assert.ok(!app.includes('"上传图片文件"'), "已移除的菜单词条不应残留");
});
