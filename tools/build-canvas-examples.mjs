#!/usr/bin/env node
// 内置案例提取脚本（dev 工具，随仓库入库；产物 modules/canvas-examples.js 一并入库）。
// 用法（仓库根目录执行）：
//   node tools/build-canvas-examples.mjs [data/app-state.json | 某项目.cflow] [--covers 封面目录] [--project 案例演示]
// 行为：按项目名定位项目页 → 把成员 ≥2 且有名字的画布编组各提取为一个案例 →
//       构建期净化运行态字段（运行时插入直接走 pasteNodes）→ 生成 modules/canvas-examples.js；
//       --covers 目录里「文件名=编组标题」的截图会复制进 assets/examples/ 并写入 cover 字段。
// 合并（2026-11-21）：重跑时读取现有 modules/canvas-examples.js 按 id 并入——现有案例保留
//（封面沿用）、新案例追加；id 与现有案例冲突时后来者加 -2/-3 后缀；标题相同的案例视为
// 同一案例的更新（沿用既有 id，封面映射保持稳定）。源项目被删/改名不会丢已收录案例。
// 封面必须使用真实节点截图；经用户授权后运行 tools/capture-real-example-covers.mjs。

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const OUT_MODULE = "modules/canvas-examples.js";
const COVER_OUT_DIR = "assets/examples";
const DEFAULT_PROJECT_HINT = "案例演示";
// 用户点名不入册的案例（2026-11-25）：按 id 排除，源项目里编组还在也不会被重新并回。
const EXCLUDED_EXAMPLE_IDS = new Set([
  "ex_canvas-group21", // 生成角色制动动作线稿图
]);

// 编组外框几何常量，与 app.js canvasGroupBounds 的 PAD_X/PAD_TOP/PAD_BOTTOM 保持一致
const GROUP_PAD_X = 16;
const GROUP_PAD_TOP = 48;
const GROUP_PAD_BOTTOM = 16;
// 画布上节点是内容驱动高度（syncContentDrivenNodeHeights 会按设置面板撑高），存档里的 h 可能
// 是旧 UI 时代的较小值；组框与封面渲染按这些类型下限取高，保证封面比例与真实画布一致
// （节点数据本身的 h 不改，只影响组框计算）。tools/render-example-covers.html 同步维护一份。
const RENDER_MIN_NODE_HEIGHTS = {
  "ai-image": 560, // 图片 + 重新生成/清除 + 模型/分辨率画质/比例张数/价格行
  "tool-node": 296, // 拓展工具的参数区 + 执行按钮
  "image": 296, // 图片 + 上传/关键词反馈/清除按钮行
};

// 构建期净化：只剥运行态与作者机器特有的引用；缩略图 dataURL、assetId（目标机缺失时
// materializeReferenceImage 有缩略图兜底）、generationPrompt、variableChoices、_sdParamValues 等保留。
// 与 app.js cloneNodeForClipboard 的运行态清理清单同源，新增运行态字段时两处同步。
const STRIP_FIELDS = [
  "generating", "taskId", "outputPath", "_aiProgress", "_queueRunId", "batchTasks",
  "_browserRequestId", "chatMessages", "_chatBusy", "chatRequestSeq",
  "_pendingVideoUrl", "_videoRefUploading", "videoBytes",
  "_sdTaskId", "_sdStatus", "_sdError", "_sdRequestSeq", "_sdParamsOpen", "_sdParamGroupsCollapsed",
];

function stripFields(node) {
  for (const field of STRIP_FIELDS) {
    if (field === "generating" || field === "taskId") {
      node[field] = field === "generating" ? false : null;
    } else {
      delete node[field];
    }
  }
  if (node.type === "ai-video") delete node.videoFile;
  if (Array.isArray(node.items)) for (const item of node.items) stripFields(item);
  if (Array.isArray(node.subgraph?.nodes)) for (const sub of node.subgraph.nodes) stripFields(sub);
}

function computeGroupFrame(members) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of members) {
    const w = Number(node.w) || 240;
    const h = Math.max(Number(node.h) || 200, RENDER_MIN_NODE_HEIGHTS[node.type] || 0);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + w);
    maxY = Math.max(maxY, node.y + h);
  }
  return {
    x: minX - GROUP_PAD_X,
    y: minY - GROUP_PAD_TOP,
    w: (maxX - minX) + GROUP_PAD_X * 2,
    h: (maxY - minY) + GROUP_PAD_TOP + GROUP_PAD_BOTTOM,
  };
}

// 纯函数（测试入口）：projectJson = { pages: [{ name, data: { nodes, edges, canvasGroupFrames, canvasGroupNames } }] }
export function extractExamplesFromProject(projectJson, { projectHint = DEFAULT_PROJECT_HINT } = {}) {
  const pages = Array.isArray(projectJson?.pages) ? projectJson.pages : [];
  const page = pages.find(candidate => String(candidate?.name || "").includes(projectHint));
  if (!page) {
    const names = pages.map(candidate => candidate?.name || "(未命名)").join(" | ");
    throw new Error(`未找到名称包含「${projectHint}」的项目页；现有项目：${names}`);
  }
  const data = page.data || {};
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const names = data.canvasGroupNames || {};

  const buckets = new Map();
  for (const node of nodes) {
    if (!node?.canvasGroupId) continue;
    if (!buckets.has(node.canvasGroupId)) buckets.set(node.canvasGroupId, []);
    buckets.get(node.canvasGroupId).push(node);
  }

  const cases = [];
  for (const [gid, members] of buckets) {
    if (members.length < 2) continue;
    const title = names[gid];
    if (!title || !String(title).trim()) {
      console.warn(`[案例提取] 跳过无名编组 ${gid}（${members.length} 个节点）；如需收录请在画布上给编组命名`);
      continue;
    }
    const memberIds = new Set(members.map(node => node.id));
    const internalEdges = edges.filter(edge => memberIds.has(edge?.from?.node) && memberIds.has(edge?.to?.node));
    const sanitizedMembers = JSON.parse(JSON.stringify(members));
    for (const node of sanitizedMembers) stripFields(node);
    // 组框始终按成员现算：缓存帧可能过期（节点重排后没刷新）且不含类型高度下限，
    // 曾导致封面按旧框裁剪、与画布排布不符（2026-11-25 实踩）
    const frame = computeGroupFrame(members);
    cases.push({
      id: `ex_${gid}`,
      title: String(title).trim(),
      nodes: sanitizedMembers,
      edges: internalEdges,
      groupFrames: { [gid]: frame },
      groupNames: { [gid]: String(title).trim() },
      frame,
    });
  }

  cases.sort((a, b) => (a.frame.y - b.frame.y) || (a.frame.x - b.frame.x));
  for (const example of cases) delete example.frame;
  return cases;
}

// 纯函数（测试入口）：读取现有产物模块里已收录的案例（源项目被删也不丢）
export function loadExistingExamples(moduleSource) {
  const match = String(moduleSource || "").match(/window\.CANVASFLOW_EXAMPLES\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 纯函数（测试入口）：新提取案例并入现有案例——同标题视为更新（沿用既有 id），
// 其余追加；id 与现有案例冲突时后来者加 -2/-3 后缀（如 ex_canvas-group20-2）。
export function mergeExamples(cases, existing) {
  const merged = [...existing];
  const titleIndex = new Map(existing.map((example, index) => [example.title, index]));
  const usedIds = new Set(existing.map(example => example.id));
  for (const example of cases) {
    const same = titleIndex.get(example.title);
    if (same !== undefined) {
      example.id = existing[same].id;
      if (existing[same].coverEn) example.coverEn = existing[same].coverEn;
      merged[same] = example;
      continue;
    }
    let id = example.id;
    for (let n = 2; usedIds.has(id); n += 1) id = `${example.id}-${n}`;
    example.id = id;
    usedIds.add(id);
    merged.push(example);
  }
  return merged;
}

function attachCovers(cases, coverDir) {
  // 已随包的封面（assets/examples/<id>.<ext>）在重跑时自动保留，无需每次都带 --covers
  if (fs.existsSync(COVER_OUT_DIR)) {
    for (const example of cases) {
      const existing = fs.readdirSync(COVER_OUT_DIR).find(name => name.replace(/\.[^.]+$/, "") === example.id && /\.(png|jpe?g|webp)$/i.test(name));
      if (existing) {
        const digest = createHash("sha256").update(fs.readFileSync(path.join(COVER_OUT_DIR, existing))).digest("hex").slice(0, 12);
        example.cover = `${COVER_OUT_DIR.replace(/\\/g, "/")}/${existing}?v=${digest}`;
      }
    }
  }
  if (!coverDir) return;
  if (!fs.existsSync(coverDir)) throw new Error(`封面目录不存在：${coverDir}`);
  fs.mkdirSync(COVER_OUT_DIR, { recursive: true });
  for (const example of cases) {
    if (example.cover) continue;
    const hit = fs.readdirSync(coverDir).find(name => {
      const base = name.replace(/\.[^.]+$/, "");
      return base === example.title && /\.(png|jpe?g|webp)$/i.test(name);
    });
    if (!hit) {
      console.warn(`[案例提取] 「${example.title}」无同名封面截图，卡片将用几何示意图`);
      continue;
    }
    const ext = path.extname(hit).toLowerCase();
    fs.copyFileSync(path.join(coverDir, hit), path.join(COVER_OUT_DIR, `${example.id}${ext}`));
    example.cover = `${COVER_OUT_DIR.replace(/\\/g, "/")}/${example.id}${ext}`;
  }
}

function loadProjectJson(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  if (parsed?.type === "project" && parsed.project) return parsed.project;
  return parsed;
}

function main() {
  const args = process.argv.slice(2);
  let inputPath = "data/app-state.json";
  let coverDir = "";
  let projectHint = DEFAULT_PROJECT_HINT;
  let onlyTitle = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--covers") coverDir = args[++i];
    else if (args[i] === "--title") onlyTitle = args[++i];
    else if (args[i] === "--project") projectHint = args[++i];
    else inputPath = args[i];
  }
  if (!inputPath || !fs.existsSync(inputPath)) throw new Error(`输入文件不存在：${inputPath}（用法见文件头注释）`);

  const cases = extractExamplesFromProject(loadProjectJson(inputPath), { projectHint }).filter(example => !onlyTitle || example.title === onlyTitle);
  if (!cases.length) throw new Error("没有提取到任何案例（需要成员 ≥2 且已命名的编组）");
  const existing = fs.existsSync(OUT_MODULE) ? loadExistingExamples(fs.readFileSync(OUT_MODULE, "utf8")) : [];
  const merged = mergeExamples(cases, existing).filter(example => {
    if (!EXCLUDED_EXAMPLE_IDS.has(example.id)) return true;
    console.log(`[案例提取] 按排除清单移除「${example.title}」（${example.id}）`);
    return false;
  });
  // 组框统一按（含类型高度下限的）成员现算：源项目已不存在的老案例（如新手引导并入的）
  // 拿不到新提取的组框，也要用同一口径，否则封面渲染与画布比例不符
  for (const example of merged) example.groupFrames = { [Object.keys(example.groupFrames)[0]]: computeGroupFrame(example.nodes) };
  console.log(`[案例提取] 现有案例 ${existing.length} 条，本次提取 ${cases.length} 条，合并后 ${merged.length} 条`);
  attachCovers(merged, coverDir);

  const payloadBytes = merged.reduce((sum, example) => sum + JSON.stringify(example).length, 0);
  fs.mkdirSync(path.dirname(OUT_MODULE), { recursive: true });
  const header =
    `// 本文件由 tools/build-canvas-examples.mjs 生成，勿手改；重新生成：\n` +
    `//   node tools/build-canvas-examples.mjs data/app-state.json --covers 封面目录\n` +
    `// 每个案例 = 画布上已命名的编组（title=编组名），插入画布走 pasteNodes 三表；\n` +
    `// 重跑按 id 并入现有案例（源项目删了也不丢），id 冲突时后来者加 -2/-3 后缀。\n`;
  fs.writeFileSync(OUT_MODULE, header + `window.CANVASFLOW_EXAMPLES = ${JSON.stringify(merged)};\n`);

  console.log(`[案例提取] 已生成 ${OUT_MODULE}`);
  for (const example of merged) {
    const biggest = example.nodes.reduce((max, node) => Math.max(max, (node.image || "").length, (node.generatedImage || "").length), 0);
    if (biggest > 200 * 1024) console.warn(`[案例提取] 「${example.title}」存在 >200KB 的内嵌图，考虑压缩后重提取`);
    console.log(`  • ${example.title}（${example.nodes.length} 节点 / ${example.edges.length} 连线${example.cover ? "，含封面" : ""}）`);
  }
  console.log(`[案例提取] 模块体积约 ${Math.round(fs.statSync(OUT_MODULE).size / 1024)}KB（案例负载 ${Math.round(payloadBytes / 1024)}KB）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // 直接执行时才跑 main；被测试 import 时只暴露纯函数
  main();
}
