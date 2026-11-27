// 自动抠图节点接入链路（2026-11-23）测试：输出端口 / 结果回写 / 下游收集——镜像放大节点（linked upscale）先例
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("静态接线：出端口、结果回写、四处收集点都认自动抠图节点", () => {
  // 出端口判定（镜像放大节点）
  assert.ok(appSource.includes("(node.type !== \"tool-node\" || isLinkedUpscaleNode(node) || isAutoMattingTool(node))"),
    "edgeInsertableNode 应给自动抠图节点输出端口");
  // 运行结果回写 toolOutputNodeIds（下游收集的数据源）
  assert.ok(appSource.includes("if (isLinkedUpscaleNode(node) || isAutoMattingTool(node)) node.toolOutputNodeIds = outputNodeIds;"),
    "runToolNode 应为自动抠图节点回写结果节点清单");
  // collectUpstreamForAI.visit：抠图上游取结果图
  assert.match(appSource, /if \(isLinkedUpscaleNode\(n\) \|\| isAutoMattingTool\(n\)\) \{\s*\/\/ 放大\/自动抠图等链式工具节点/);
  // directScreenshotNodeInputs：抠图上游沿结果节点继续走
  assert.match(appSource, /if \(isLinkedUpscaleNode\(node\) \|\| isAutoMattingTool\(node\)\) \{\s*for \(const output of linkedToolOutputs\(node\)\) visit\(output\.id\);/);
  // collectVideoRefInputs：抠图与放大同样按边界处理
  assert.ok(appSource.includes("if (isLinkedUpscaleNode(n) || isAutoMattingTool(n)) return;"),
    "视频引用收集应把自动抠图当边界节点");
});

test("出端口判定切片：抠图/放大工具节点有输出端口，调色盘/截图/输出节点没有", () => {
  const start = appSource.indexOf("function isLinkedUpscaleNode");
  const end = appSource.indexOf("\nfunction ", start + 10);
  const linked = appSource.slice(start, end);
  const isAuto = appSource.slice(appSource.indexOf("function isAutoMattingTool"));
  const isAutoEnd = isAuto.indexOf("\nfunction");
  const edgeStart = appSource.indexOf("function edgeInsertableNode");
  const edgeEnd = appSource.indexOf("\n}", edgeStart) + 2; // "\n}" 是闭合括号整体，+2 才包含
  const context = vm.createContext({});
  vm.runInContext(linked + "\n" + isAuto.slice(0, isAutoEnd) + "\n" + appSource.slice(edgeStart, edgeEnd), context);
  const f = context.edgeInsertableNode;
  assert.equal(f({ type: "tool-node", toolMeta: { id: "auto-matting-u2net" } }), true, "自动抠图节点应有输出端口");
  assert.equal(f({ type: "tool-node", toolMeta: { id: "upscale-white-point" } }), true, "放大节点维持输出端口");
  assert.equal(f({ type: "tool-node", toolMeta: { id: "image-vectorize" } }), false, "矢量化等非链式工具节点保持无端口");
  assert.equal(f({ type: "palette" }), false);
  assert.equal(f({ type: "screenshot-input" }), false);
  assert.equal(f({ type: "ai-image" }), true);
});

test("上游收集切片：AI 节点从抠图节点的结果图片节点取图，未运行时不产生分支", () => {
  const collectStart = appSource.indexOf("function collectUpstreamForAI");
  const collectEnd = appSource.indexOf("\nfunction ", collectStart + 10);
  const linkedStart = appSource.indexOf("function isLinkedUpscaleNode");
  const linkedEnd = appSource.indexOf("\nfunction ", linkedStart + 10);
  const isAutoStart = appSource.indexOf("function isAutoMattingTool");
  const isAutoSrc = appSource.slice(isAutoStart, appSource.indexOf("\nfunction", isAutoStart));
  const linkedToolStart = appSource.indexOf("function linkedToolOutputs");
  const linkedToolSrc = appSource.slice(linkedToolStart, appSource.indexOf("\nfunction", linkedToolStart));
  const slice = appSource.slice(collectStart, collectEnd) + "\n"
    + appSource.slice(linkedStart, linkedEnd) + "\n" + isAutoSrc + "\n" + linkedToolSrc + "\n"
    + "function expandTextNodeVariables(n) { return String(n.text || ''); }\n"
    + "function variableNodeOutput() { return ''; }\n"
    + "function chatNodeOutputText() { return ''; }\n";
  const matting = { id: "m1", type: "tool-node", toolMeta: { id: "auto-matting-u2net" }, x: 300, y: 0 };
  const out = { id: "o1", type: "image", x: 300, y: 300, image: "matted-data", fileName: "matted.png", mime: "image/png", toolSourceNodeId: "m1" };
  const ai = { id: "a1", type: "ai-image", x: 600, y: 0 };
  const nodes = { m1: matting, o1: out, a1: ai };
  const edges = [{ id: "e1", from: { node: "m1", port: "out" }, to: { node: "a1", port: "in" } }];
  const context = vm.createContext({
    state: { settings: {} },
    findNode: id => nodes[id] || null,
    buildIncomingIndex: () => {
      const map = new Map();
      for (const e of edges) { if (!map.has(e.to.node)) map.set(e.to.node, []); map.get(e.to.node).push(e); }
      return map;
    },
    expandTextNodeVariables: n => String(n.text || ""),
    variableNodeOutput: () => "",
    chatNodeOutputText: () => "",
    window: {},
  });
  vm.runInContext(slice, context);
  // 运行后：toolOutputNodeIds 已回写 → AI 节点收集到抠图结果
  matting.toolOutputNodeIds = ["o1"];
  const result = JSON.parse(JSON.stringify(context.collectUpstreamForAI("a1")));
  assert.equal(result.branches.length, 1, "抠图 → AI 单支线一个任务");
  assert.equal(result.images.length, 1, "收集到抠图结果图");
  assert.equal(result.images[0].image, "matted-data");
  assert.equal(result.images[0].fileName, "matted.png");
  // 未运行（无结果节点清单）→ 不产生分支
  delete matting.toolOutputNodeIds;
  const empty = JSON.parse(JSON.stringify(context.collectUpstreamForAI("a1")));
  assert.equal(empty.branches.length, 0, "抠图未运行时上游无图");
  assert.equal(empty.images.length, 0);
});
