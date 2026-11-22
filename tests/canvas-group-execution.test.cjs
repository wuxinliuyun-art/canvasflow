const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function planner(nodes, edges) {
  const start = source.indexOf("function canvasGroupExecutionPlan");
  const end = source.indexOf("\nfunction waitForGroupQueueTasks", start);
  const context = {
    state: { nodes, edges },
    CANVAS_GROUP_RUNNABLE_TYPES: new Set(["ai-image", "ai-video", "angle-image", "browser-image", "chat", "local-sd", "tool-node"]),
    canvasGroupMembers: id => nodes.filter(node => node.canvasGroupId === id),
    findNode: id => nodes.find(node => node.id === id),
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.plan = canvasGroupExecutionPlan;`, context);
  return context.plan("g");
}

test("group execution follows dependencies and uses position only for independent nodes", () => {
  const nodes = [
    { id: "right", type: "ai-image", canvasGroupId: "g", x: 300, y: 0 },
    { id: "left", type: "chat", canvasGroupId: "g", x: 0, y: 0 },
    { id: "last", type: "tool-node", canvasGroupId: "g", x: 20, y: 200 },
    { id: "input", type: "text", canvasGroupId: "g", x: -100, y: 0 },
  ];
  const edges = [
    { from: { node: "left" }, to: { node: "last" } },
    { from: { node: "right" }, to: { node: "last" } },
  ];
  assert.deepEqual(Array.from(planner(nodes, edges).ordered, node => node.id), ["left", "right", "last"]);
});

test("group execution rejects cycles", () => {
  const nodes = [
    { id: "a", type: "ai-image", canvasGroupId: "g", x: 0, y: 0 },
    { id: "b", type: "chat", canvasGroupId: "g", x: 100, y: 0 },
  ];
  const edges = [
    { from: { node: "a" }, to: { node: "b" } },
    { from: { node: "b" }, to: { node: "a" } },
  ];
  assert.throws(() => planner(nodes, edges), /循环连线/);
});

test("group stop cancels unsent tasks and AI image execution clears old output", () => {
  assert.match(source, /node\.generatedImage = null; delete node\.generatedAssetId; node\.outputPath = "";[\s\S]*enqueueAiNode\(node\.id, "node-preview"\)/);
  assert.match(source, /task\.groupRunId === run\.id && task\.status === "waiting"[\s\S]*task\.status = "cancelled"/);
  assert.match(source, /task\.groupRunId[\s\S]*\.stopped[\s\S]*task\.status = "cancelled"/);
});

test("group frame exposes run and stop controls", () => {
  assert.match(source, /data-group-action="\$\{groupRun \? "stop" : "run"\}"/);
  assert.match(source, /runCanvasGroup\(groupFrame\.dataset\.groupId\)/);
  assert.match(source, /stopCanvasGroup\(groupFrame\.dataset\.groupId\)/);
  // 运行按钮是开发专用 UI：由 dev-flag.js 的 window.CANVASFLOW_DEV 门控，发布版隐藏（2026-11-14 用户要求）
  assert.match(source, /window\.CANVASFLOW_DEV \? `<button type="button" class="node-group-run" data-group-action="\$\{groupRun/);
});

// ---------- 编组链路跨页存活（2026-11-21 实踩回归） ----------
// AI 任务完成时用户已切到其他项目页：state.nodes 换成了别页节点，runToolNode 的 findNode
// 守卫静默跳过，成功判定读到编组计划时捕获的旧对象（残留上次"完成（0 秒）"状态），
// 编组"正常完成"却什么都没做。每步必须按 id 重解析；节点不在当前画布就等切回。

function runHarness(nodes, pages, hooks) {
  const start = source.indexOf("function resolveGroupNodeForStep");
  const end = source.indexOf("\n// 笔刷类工具", start);
  const timers = [];
  const context = {
    state: { nodes, pages, edges: [] },
    console,
    CANVAS_GROUP_RUNNABLE_TYPES: new Set(["ai-image", "ai-video", "angle-image", "browser-image", "chat", "local-sd", "tool-node"]),
    canvasGroupMembers: id => nodes.filter(node => node.canvasGroupId === id),
    findNode: id => nodes.find(node => node.id === id),
    renderNodes: () => {},
    renderTaskQueue: () => {},
    toast: msg => hooks.toasts.push(msg),
    runToolNode: async nodeId => { hooks.toolRuns.push(nodeId); const n = context.findNode(nodeId); if (n) n.toolStatus = { state: "done", message: "完成（0 秒）" }; },
    generateBrowserImage: async () => {},
    sendChatNodeMessage: async () => {},
    generateAngleImage: async () => {},
    enqueueAiNode: () => 1,
    enqueueVideoNode: () => 1,
    aiTaskQueue: { items: [] },
    queueTaskIsSettled: task => ["done", "failed", "cancelled"].includes(task.status),
  };
  context.window = {
    setInterval: (fn) => { const t = setInterval(fn, 30); timers.push(t); return t; },
    clearInterval: t => clearInterval(t),
  };
  context.clearInterval = context.window.clearInterval; // 切片内是裸 clearInterval，按上下文解析
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.runCanvasGroupNode = runCanvasGroupNode;`, context);
  return context;
}

test("group step waits for the node to return to canvas after a page switch, then executes", async () => {
  const matting = { id: "n142", type: "tool-node", canvasGroupId: "g", x: 0, y: 0, toolStatus: { state: "done", message: "完成（0 秒）" } };
  // 用户切到其他页：当前画布没有该节点，但节点仍存在于所属项目页数据里
  const hooks = { toasts: [], toolRuns: [] };
  const context = runHarness([], [{ id: "p1", data: { nodes: [matting] } }], hooks);
  const run = { id: "run-1", stopped: false };
  const pending = context.runCanvasGroupNode(matting, run);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.deepEqual(hooks.toolRuns, [], "节点不在当前画布时不得执行");
  // 用户切回：节点以新身份回到画布（深克隆等价物），执行应恢复且成功判定读活对象
  const live = { ...matting, toolStatus: { state: "running", message: "收集输入图片…" } };
  context.state.nodes.push(live);
  assert.equal(await pending, true, "切回后应执行并以活节点状态判定成功");
  assert.deepEqual(hooks.toolRuns, ["n142"]);
});

test("group step fails cleanly when the node no longer exists on any page", async () => {
  const hooks = { toasts: [], toolRuns: [] };
  const context = runHarness([], [], hooks);
  const ghost = { id: "gone", type: "tool-node", canvasGroupId: "g", x: 0, y: 0 };
  assert.equal(await context.runCanvasGroupNode(ghost, { id: "run-2", stopped: false }), false);
  assert.deepEqual(hooks.toolRuns, [], "节点被删除后不得执行");
});

test("group step re-resolves the live node by id before dispatching", () => {
  // 每步执行前按 id 重新解析（铁律：长异步 + 捕获对象 → 不得信任计划时捕获的节点）
  assert.match(source, /async function runCanvasGroupNode\(node, run\) \{\s*\n\s*node = await resolveGroupNodeForStep\(node, run\);/);
  // 等待期间保留"节点还在某个项目页数据里就继续等"的语义（与任务队列结果落回一致）
  assert.match(source, /state\.pages\.some\(page => \(page\.data\?\.nodes \|\| \[\]\)\.some\(item => item\.id === node\.id\)\)/);
});
