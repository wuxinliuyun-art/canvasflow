#!/usr/bin/env node
// 案例封面补图工具（dev 工具，随仓库入库）：对缺少/已过时的内置案例封面，用无头 Chrome/Edge 渲染
// tools/render-example-covers.html（绘制逻辑复刻 app.js 编组截图）逐张截图到 assets/examples/<id>.png。
// 不连服务、不碰用户画布实例——数据源是 modules/canvas-examples.js 内嵌 dataURL。
// 用法（仓库根目录执行，需本机装有 Chrome/Edge）：
//   node tools/render-example-covers.mjs            # 补齐缺失 + 重渲尺寸与组框不符的陈旧封面
//   node tools/render-example-covers.mjs ex_xxx ... # 只渲染指定 id
//   加 --force：无视陈旧判定全部重渲（仅限工具自渲封面，手工截图封面请勿整批覆盖）
// 渲染完成后重跑 node tools/build-canvas-examples.mjs data/app-state.json 即可把封面并入模块（按 id 自动拾取）。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUT_DIR = "assets/examples";
const RENDER_PAGE = "tools/render-example-covers.html";
const GENERATED_MANIFEST = "tools/generated-covers.json";
const MAX_SIDE = 2400;
const SCREENSHOT_WAIT_MS = 45000;
const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function loadExamples() {
  const source = fs.readFileSync("modules/canvas-examples.js", "utf8");
  const match = source.match(/window\.CANVASFLOW_EXAMPLES\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!match) throw new Error("无法从 modules/canvas-examples.js 解析案例清单");
  return JSON.parse(match[1]);
}

function boundsOf(example) {
  const gid = Object.keys(example.groupFrames || {})[0];
  return (gid && example.groupFrames[gid]) || { w: 800, h: 500 };
}

function pngSize(file) {
  const header = fs.readFileSync(file).subarray(0, 24);
  if (header.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function loadGeneratedManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(GENERATED_MANIFEST, "utf8"));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function recordGenerated(id) {
  const ids = loadGeneratedManifest();
  ids.add(id);
  fs.writeFileSync(GENERATED_MANIFEST, `${JSON.stringify([...ids].sort(), null, 2)}\n`);
}

// 封面陈旧判定（只针对本工具生成的封面，手工截图永不自动重渲）：
// 模块里组框尺寸（×缩放系数）与封面 PNG 实际尺寸不符 = 节点排布已变（如同名编组在画布上重排后
// 数据被提取更新，但封面 PNG 还是旧排布渲染的），需要重渲。
function coverStale(example, output, generatedIds) {
  if (!fs.existsSync(output)) return true;
  if (!generatedIds.has(example.id)) return false; // 手工截图封面：尺寸本来就不按组框公式，永不自动重渲
  const bounds = boundsOf(example);
  const scale = Math.min(2, MAX_SIDE / Math.max(bounds.w, bounds.h, 1));
  const expected = { width: Math.max(1, Math.round(bounds.w * scale)), height: Math.max(1, Math.round(bounds.h * scale)) };
  const actual = pngSize(output);
  return !actual || actual.width !== expected.width || actual.height !== expected.height;
}

function findBrowser() {
  const hit = BROWSER_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!hit) throw new Error("未找到 Chrome/Edge，请在 BROWSER_CANDIDATES 中补充路径");
  return hit;
}

// msedge/chrome 的启动器进程会立即返回，真正渲染在后台进行——必须轮询等截图文件落地
function waitForFile(output, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let pinged = false;
  while (Date.now() < deadline) {
    if (fs.existsSync(output) && fs.statSync(output).size > 0) return;
    if (!pinged && Date.now() > deadline - timeoutMs / 2) {
      console.warn("    …仍在渲染（后台浏览器进程进行中）");
      pinged = true;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error("浏览器未产出截图（超时）");
}

function renderOne(browser, example) {
  const bounds = boundsOf(example);
  const scale = Math.min(2, MAX_SIDE / Math.max(bounds.w, bounds.h, 1));
  const width = Math.max(1, Math.round(bounds.w * scale));
  const height = Math.max(1, Math.round(bounds.h * scale));
  const pageUrl = `${pathToFileURL(RENDER_PAGE).href}?id=${encodeURIComponent(example.id)}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "canvasflow-cover-profile-"));
  const output = path.resolve(path.join(OUT_DIR, `${example.id}.png`));
  fs.rmSync(output, { force: true });
  try {
    const result = spawnSync(browser, [
      "--headless",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      `--screenshot=${output}`,
      "--virtual-time-budget=15000",
      pageUrl,
    ], { stdio: "ignore", timeout: 90000 });
    if (result.error) throw result.error;
    waitForFile(output, SCREENSHOT_WAIT_MS);
    recordGenerated(example.id);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(`  • ${example.title} → ${output}（${width}×${height}）`);
}

function main() {
  const args = process.argv.slice(2);
  const onlyIds = new Set(args.filter(arg => !arg.startsWith("--")));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const examples = loadExamples().filter(example => {
    if (onlyIds.size && !onlyIds.has(example.id)) return false;
    if (onlyIds.size) return true; // 显式点名 = 无条件重渲（手工截图封面勿点名，会被工具版覆盖）
    return coverStale(example, path.join(OUT_DIR, `${example.id}.png`), loadGeneratedManifest());
  });
  if (!examples.length) { console.log("[封面渲染] 没有需要补图/重渲的案例"); return; }
  const browser = findBrowser();
  console.log(`[封面渲染] 待渲染 ${examples.length} 张（浏览器：${browser}）`);
  const failures = [];
  for (const example of examples) {
    try {
      renderOne(browser, example);
    } catch (error) {
      failures.push(example);
      console.warn(`  ✗ ${example.title}（${example.id}）：${error?.message || error}`);
    }
  }
  if (failures.length) {
    console.error(`[封面渲染] ${failures.length} 张失败，可单独重试：node tools/render-example-covers.mjs ${failures.map(example => example.id).join(" ")}`);
    process.exitCode = 1;
  } else {
    console.log("[封面渲染] 全部完成；重跑 node tools/build-canvas-examples.mjs data/app-state.json 并入封面");
  }
}

main();
