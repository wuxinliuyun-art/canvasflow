// 编组截图（2026-11-21）测试：计划纯函数切片 + 菜单接线与保存链路静态断言
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `源码里找不到切片起点：${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `源码里找不到切片终点：${endMarker}`);
  return source.slice(start, end);
}

function loadPlanContext(state) {
  const padBottom = appSource.match(/const CANVAS_GROUP_PAD_BOTTOM = \d+;/)[0];
  const parts = [
    "const NODE_WIDTH = 240;\nconst NODE_HEIGHT = 172;\n",
    sliceBetween(appSource, "const CANVAS_GROUP_PAD_X", "const CANVAS_GROUP_PAD_BOTTOM") + padBottom + "\n",
    sliceBetween(appSource, "function canvasGroupNodeRect", "function canvasGroupBounds") + "\n",
    sliceBetween(appSource, "function canvasGroupBounds", "\n// 选中单个节点") + "\n",
    appSource.match(/function safeName\(name\) \{[\s\S]*?\n\}/)[0] + "\n",
    sliceBetween(appSource, "function canvasGroupMembers", "\nfunction expandCanvasGroupIds") + "\n",
    sliceBetween(appSource, "function groupScreenshotPlan", "\nfunction loadGroupScreenshotImage") + "\n",
  ];
  const context = vm.createContext({ state });
  vm.runInContext(parts.join("\n"), context, { filename: "group-screenshot-slice.js" });
  return context;
}

test("截图计划：成员收集、只收组内连线、文件名 = 编组名.png", () => {
  const state = {
    nodes: [
      { id: "a", type: "text", x: 100, y: 200, w: 240, h: 172, canvasGroupId: "g1" },
      { id: "b", type: "ai-image", x: 400, y: 100, w: 240, h: 400, canvasGroupId: "g1" },
      { id: "c", type: "image", x: 700, y: 100, canvasGroupId: "g2" },
    ],
    edges: [
      { id: "e1", from: { node: "a" }, to: { node: "b" } },
      { id: "e2", from: { node: "b" }, to: { node: "c" } },
      { id: "e3", from: { node: "c" }, to: { node: "a" } },
    ],
    canvasGroupNames: { g1: "连续修改" },
    canvasGroupFrames: {},
  };
  const context = loadPlanContext(state);
  const plan = context.groupScreenshotPlan("g1");
  assert.ok(plan, "两成员命名组应有计划");
  assert.deepStrictEqual(plan.members.map(node => node.id), ["a", "b"], "成员按画布序收集");
  assert.deepStrictEqual(plan.internalEdges.map(edge => edge.id), ["e1"], "只收两端都在组内的连线");
  assert.strictEqual(plan.title, "连续修改");
  assert.strictEqual(plan.fileName, "连续修改.png", "文件名与案例封面约定（--covers 按标题）一致");
  const bounds = plan.bounds;
  assert.strictEqual(bounds.x, 100 - 16, "外框左右 PAD 16");
  assert.strictEqual(bounds.y, 100 - 48, "外框顶部 PAD 48");
  assert.strictEqual(bounds.w, (400 + 240 + 16) - (100 - 16), "外框宽度含成员最大宽");
  assert.ok(state.canvasGroupFrames.g1, "计划会顺带刷新外框几何（与画布外框一致）");
});

test("截图计划：单成员组拒绝、无名组兜底「编组」、非法文件名字符净化", () => {
  const state = {
    nodes: [{ id: "solo", type: "text", x: 0, y: 0, canvasGroupId: "g9" }],
    edges: [],
    canvasGroupNames: { g9: "单成员" },
  };
  const context = loadPlanContext(state);
  assert.strictEqual(context.groupScreenshotPlan("g9"), null, "单成员组不成截图计划");

  const state2 = {
    nodes: [
      { id: "a", type: "text", x: 0, y: 0, canvasGroupId: "g8" },
      { id: "b", type: "text", x: 300, y: 0, canvasGroupId: "g8" },
    ],
    edges: [],
    canvasGroupNames: {},
  };
  const context2 = loadPlanContext(state2);
  const plan = context2.groupScreenshotPlan("g8");
  assert.strictEqual(plan.title, "编组", "无名组标题兜底");
  assert.strictEqual(plan.fileName, "编组.png");

  const state3 = {
    nodes: [
      { id: "a", type: "text", x: 0, y: 0, canvasGroupId: "g7" },
      { id: "b", type: "text", x: 300, y: 0, canvasGroupId: "g7" },
    ],
    edges: [],
    canvasGroupNames: { g7: 'a/b:c*d' },
  };
  const context3 = loadPlanContext(state3);
  assert.strictEqual(context3.groupScreenshotPlan("g7").fileName, "a_b_c_d.png", "safeName 净化路径字符");
});

test("菜单接线：编组外框右键与选中单编组右键都有「编组截图」入口", () => {
  assert.ok(appSource.includes('["编组截图", () => screenshotCanvasGroup(groupId)]'),
    "编组外框右键菜单应含编组截图");
  assert.ok(appSource.includes('["编组截图", () => screenshotCanvasGroup(canvasMenuGroupIds[0])]'),
    "选中节点单编组右键菜单应含编组截图");
});

test("保存链路：走 /api/save-export-files，编组截图目录 + 封面命名 + 长边上限", () => {
  assert.ok(appSource.includes('folderName: "编组截图", baseFolder: "export"'), "保存到 export/编组截图/");
  assert.ok(appSource.includes("files: [{ name: plan.fileName, data: dataUrl }]"), "文件名取计划文件名");
  assert.ok(appSource.includes("const MAX_SIDE = 2400;"), "渲染长边有上限防超大画布");
  assert.ok(appSource.includes('getComputedStyle(els.app || document.body)'), "颜色令牌取自 #app（跟随明暗主题）");
  assert.ok(appSource.includes("async function screenshotCanvasGroup(groupId)"), "渲染入口存在");
  assert.ok(appSource.includes("function groupScreenshotNodeTitle"), "节点标题映射存在");
  assert.ok(appSource.includes("function groupScreenshotWrapText"), "文字换行函数存在");
});

test("i18n：EN 词条覆盖菜单与结果提示", () => {
  assert.ok(appSource.includes('"编组截图": "Screenshot Group"'), "UI_EN 表含编组截图词条");
});
