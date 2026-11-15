"use strict";

// 生成图片按提示词「名字：」前缀命名（2026-11-14 用户规则）：
// vm 切片真实源码验证 promptSubjectNameLabels / generatedResultFileName 的命名行为，
// 并验证保存接口 writeExportFile（server.js）对重名文件的 " (n)" 序号兜底（从不覆盖）。
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const APP_SOURCE = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");

// 提取平衡花括号的顶层函数源码（本文件锚定的函数均不含不成对花括号字符串）
function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`锚点不存在：${signature}`);
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (!depth) { end = i + 1; break; }
    }
  }
  if (end < 0) throw new Error(`花括号不平衡：${signature}`);
  return source.slice(start, end);
}

const context = vm.createContext({
  Array, Date, Math, Number, RegExp, Set, String, JSON,
  path: require("node:path"), fs, os, Buffer, console,
});
for (const signature of [
  "function extensionFor(name, mime)",
  "function safeName(name)",
  "function promptSubjectNameLabels(prompt)",
  "function generatedResultFileName(task, node, dataUrl)",
]) {
  vm.runInContext(extractFunction(APP_SOURCE, signature), context);
}
vm.runInContext(extractFunction(SERVER_SOURCE, "function writeExportFile(requestedPath, bytes)"), context);

const generatedResultFileName = (...args) => vm.runInContext("generatedResultFileName", context)(...args);
const writeExportFile = (...args) => vm.runInContext("writeExportFile", context)(...args);

test("单段提示词「名字：」开头 → 直接用名字命名", () => {
  const fileName = generatedResultFileName({ prompt: "谷玄一：白底角色立绘，成年男性，黄金铠甲", projectName: "角色" }, null, "data:image/png;base64,AAA");
  assert.strictEqual(fileName, "谷玄一.png");
});

test("两段提示词（空行分隔）→ 名字用「-」连接", () => {
  const prompt = [
    "朗修：白底角色立绘，光头壮汉，肌肉虬结，嘴里衔草根，肩扛等身巨锤，满身人名刺青，表情凶狠，正面全身，暗黑奇幻，干净白底",
    "",
    "夜殇：白底角色立绘，白发老者，白发梳理整齐，白衣，手指细长，手持画蛟龙的纸质折扇，笑容温雅，眼神阴冷，正面全身，国风奇幻，干净白底",
  ].join("\n");
  const fileName = generatedResultFileName({ prompt, projectName: "角色" }, null, "data:image/png;base64,AAA");
  assert.strictEqual(fileName, "朗修-夜殇.png");
});

test("半角冒号同样识别", () => {
  const fileName = generatedResultFileName({ prompt: "朗修: 白底角色立绘，光头壮汉" }, null, "data:image/png;base64,AAA");
  assert.strictEqual(fileName, "朗修.png");
});

test("段内冒号行（非段首）不参与命名", () => {
  const fileName = generatedResultFileName({ prompt: "谷玄一：白底角色立绘，成年男性\n表情：严肃，眼神锐利" }, null, "data:image/png;base64,AAA");
  assert.strictEqual(fileName, "谷玄一.png");
});

test("部分段落没有名字时仍取带名字的段落", () => {
  const fileName = generatedResultFileName({ prompt: "国风奇幻，干净白底\n\n夜殇：白发老者" }, null, "data:image/png;base64,AAA");
  assert.strictEqual(fileName, "夜殇.png");
});

test("重复名字去重只保留一个", () => {
  const fileName = generatedResultFileName({ prompt: "朗修：光头壮汉\n\n朗修：白发老者" }, null, "data:image/png;base64,AAA");
  assert.strictEqual(fileName, "朗修.png");
});

test("无「名字：」前缀回退旧的 日期-项目-序号 命名", () => {
  const fileName = generatedResultFileName({ id: "q123", prompt: "白底角色立绘，成年男性，黄金铠甲", projectName: "角色库" }, null, "data:image/png;base64,AAA");
  assert.match(fileName, /^\d{6}-角色库-123\.png$/);
});

test("段首是链接（https://）不当名字，回退旧命名", () => {
  const fileName = generatedResultFileName({ id: "q5", prompt: "https://example.com/ref.png 配色参考，成年男性", projectName: "角色库" }, null, "data:image/png;base64,AAA");
  assert.match(fileName, /^\d{6}-角色库-005\.png$/);
});

test("名字前缀带句读标点不识别（防误伤普通文字）", () => {
  const fileName = generatedResultFileName({ id: "q7", prompt: "白底角色立绘，成年男性：黄金铠甲", projectName: "角色库" }, null, "data:image/png;base64,AAA");
  assert.match(fileName, /^\d{6}-角色库-007\.png$/);
});

test("纯数字开头的前缀不识别", () => {
  const fileName = generatedResultFileName({ id: "q8", prompt: "1：白底角色立绘", projectName: "角色库" }, null, "data:image/png;base64,AAA");
  assert.match(fileName, /^\d{6}-角色库-008\.png$/);
});

test("名字前缀最长 16 字符：恰好 16 字识别，再长整个不识别回退旧命名", () => {
  const name16 = "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳"; // 恰 16 字
  const named = generatedResultFileName({ prompt: `${name16}：白底角色立绘` }, null, "data:image/png;base64,AAA");
  assert.strictEqual(named, `${name16}.png`);
  const tooLong = `${name16}午`; // 17 字：不当作名字
  const fallback = generatedResultFileName({ id: "q9", prompt: `${tooLong}：白底角色立绘`, projectName: "角色库" }, null, "data:image/png;base64,AAA");
  assert.match(fallback, /^\d{6}-角色库-009\.png$/);
});

test("多名字总长超 40 字符时停止追加，保住完整名字", () => {
  const name13 = "A".repeat(13);
  const prompt = [1, 2, 3, 4].map(n => `${name13}${n}：角色${n}`).join("\n\n");
  const fileName = generatedResultFileName({ prompt }, null, "data:image/png;base64,AAA");
  const stem = fileName.replace(/\.png$/, "");
  assert.ok(Array.from(stem).length <= 40);
  assert.ok(stem.startsWith(`${name13}1-`));
});

test("多图任务保留 _02 起的结果序号后缀", () => {
  const fileName = generatedResultFileName({ prompt: "谷玄一：白底角色立绘", resultImageIndex: 1 }, null, "data:image/png;base64,AAA");
  assert.strictEqual(fileName, "谷玄一_02.png");
});

test("保存接口对重名文件自动加 \" (n)\" 序号且不覆盖原文件", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "subject-name-"));
  try {
    const target = path.join(directory, "朗修.png");
    fs.writeFileSync(target, Buffer.from("original"));
    const first = writeExportFile(target, Buffer.from("second"));
    assert.strictEqual(first, path.join(directory, "朗修 (1).png"));
    const second = writeExportFile(target, Buffer.from("third"));
    assert.strictEqual(second, path.join(directory, "朗修 (2).png"));
    assert.strictEqual(fs.readFileSync(target, "utf8"), "original");
    assert.strictEqual(fs.readFileSync(first, "utf8"), "second");
    assert.strictEqual(fs.readFileSync(second, "utf8"), "third");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("保存接口对无冲突文件按原名保存", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "subject-name-"));
  try {
    const target = path.join(directory, "夜殇.png");
    const saved = writeExportFile(target, Buffer.from("data"));
    assert.strictEqual(saved, target);
    assert.strictEqual(fs.readFileSync(saved, "utf8"), "data");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
