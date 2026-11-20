#!/usr/bin/env node
// 内置案例提取脚本（dev 工具，随仓库入库；产物 modules/canvas-examples.js 一并入库）。
// 用法（仓库根目录执行）：
//   node tools/build-canvas-examples.mjs [data/app-state.json | 某项目.cflow] [--covers 封面目录] [--project 案例演示]
// 行为：按项目名定位项目页 → 把成员 ≥2 且有名字的画布编组各提取为一个案例 →
//       构建期净化运行态字段（运行时插入直接走 pasteNodes）→ 生成 modules/canvas-examples.js；
//       --covers 目录里「文件名=编组标题」的截图会复制进 assets/examples/ 并写入 cover 字段。
// 封面升级：用户补截图后重跑本脚本即可，case id 由编组 id 派生、重跑保持稳定。

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUT_MODULE = "modules/canvas-examples.js";
const COVER_OUT_DIR = "assets/examples";
const DEFAULT_PROJECT_HINT = "案例演示";

// 编组外框几何常量，与 app.js canvasGroupBounds 的 PAD_X/PAD_TOP/PAD_BOTTOM 保持一致
const GROUP_PAD_X = 16;
const GROUP_PAD_TOP = 48;
const GROUP_PAD_BOTTOM = 16;

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
    const h = Number(node.h) || 200;
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
  const frames = data.canvasGroupFrames || {};

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
    const frame = frames[gid] ? { ...frames[gid] } : computeGroupFrame(members);
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

function attachCovers(cases, coverDir) {
  // 已随包的封面（assets/examples/<id>.<ext>）在重跑时自动保留，无需每次都带 --covers
  if (fs.existsSync(COVER_OUT_DIR)) {
    for (const example of cases) {
      const existing = fs.readdirSync(COVER_OUT_DIR).find(name => name.replace(/\.[^.]+$/, "") === example.id && /\.(png|jpe?g|webp)$/i.test(name));
      if (existing) example.cover = `${COVER_OUT_DIR.replace(/\\/g, "/")}/${existing}`;
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
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--covers") coverDir = args[++i];
    else if (args[i] === "--project") projectHint = args[++i];
    else inputPath = args[i];
  }
  if (!inputPath || !fs.existsSync(inputPath)) throw new Error(`输入文件不存在：${inputPath}（用法见文件头注释）`);

  const cases = extractExamplesFromProject(loadProjectJson(inputPath), { projectHint });
  if (!cases.length) throw new Error("没有提取到任何案例（需要成员 ≥2 且已命名的编组）");
  attachCovers(cases, coverDir);

  const payloadBytes = cases.reduce((sum, example) => sum + JSON.stringify(example).length, 0);
  fs.mkdirSync(path.dirname(OUT_MODULE), { recursive: true });
  const header =
    `// 本文件由 tools/build-canvas-examples.mjs 生成，勿手改；重新生成：\n` +
    `//   node tools/build-canvas-examples.mjs data/app-state.json --covers 封面目录\n` +
    `// 每个案例 = 「${projectHint}」项目里的一个画布编组（title=编组名），插入画布走 pasteNodes 三表。\n`;
  fs.writeFileSync(OUT_MODULE, header + `window.CANVASFLOW_EXAMPLES = ${JSON.stringify(cases)};\n`);

  console.log(`[案例提取] 已生成 ${OUT_MODULE}`);
  for (const example of cases) {
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
