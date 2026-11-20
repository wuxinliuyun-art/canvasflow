// 案例面板（内置案例）测试：生成模块形状 / 运行时接线 / 提取脚本纯函数
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function loadExamplesModule() {
  const state = { window: {} };
  new Function("window", read("modules/canvas-examples.js"))(state.window);
  return state.window.CANVASFLOW_EXAMPLES;
}

test("生成模块：每个案例是带名字的编组，节点/连线/三表形状完整", () => {
  const examples = loadExamplesModule();
  assert.ok(Array.isArray(examples) && examples.length >= 1, "内置案例清单不能为空");
  for (const example of examples) {
    assert.ok(example.id && example.id.startsWith("ex_"), `案例 id 形如 ex_*：${example.id}`);
    assert.ok(example.title && String(example.title).trim(), `案例「${example.id}」标题非空`);
    assert.ok(Array.isArray(example.nodes) && example.nodes.length >= 2, `案例「${example.title}」至少 2 个节点`);
    const groupIds = [...new Set(example.nodes.map(node => node.canvasGroupId).filter(Boolean))];
    assert.strictEqual(groupIds.length, 1, `案例「${example.title}」成员同属一个编组`);
    for (const node of example.nodes) {
      assert.strictEqual(node.canvasGroupId, groupIds[0], `案例「${example.title}」成员标记一致`);
      assert.ok(!(node.generating) && !node.taskId && node.outputPath === undefined && !node.chatMessages,
        `案例「${example.title}」不得携带运行态字段（${node.type}）`);
      for (const field of ["image", "generatedImage"]) {
        if (node[field]) assert.match(String(node[field]), /^data:image\//, `案例「${example.title}」${field} 应为内嵌 dataURL`);
      }
    }
    for (const edge of example.edges || []) {
      assert.ok(example.nodes.some(node => node.id === edge.from?.node) && example.nodes.some(node => node.id === edge.to?.node),
        `案例「${example.title}」连线端点必须都在组内`);
    }
    assert.ok(example.groupFrames?.[groupIds[0]] && example.groupNames?.[groupIds[0]] === example.title,
      `案例「${example.title}」组框与组名表齐备`);
    if (example.cover) assert.match(example.cover, /^assets\/examples\//, "封面路径指向随包目录");
  }
});

test("运行时接线：面板开关/渲染/插入/预览与 DOM 就位", () => {
  const app = read("app.js");
  const html = read("index.html");
  for (const name of ["setExamplesPanelOpen", "renderExamplesPanel", "addCanvasExample", "drawExamplePreview", "exampleViewportAnchor"]) {
    assert.match(app, new RegExp(`function ${name}\\(`), `app.js 缺少 ${name}`);
  }
  assert.match(app, /canvasGroupFrames: JSON\.parse\(JSON\.stringify\(example\.groupFrames \|\| \{\}\)\)/, "插入时必须把组框表交给 pasteNodes");
  assert.match(app, /canvasGroupNames: JSON\.parse\(JSON\.stringify\(example\.groupNames \|\| \{\}\)\)/, "插入时必须把组名表交给 pasteNodes");
  assert.match(app, /setSettingsSidebarOpen\(open\) \{[\s\S]*?setExamplesPanelOpen\(false\)/, "打开设置需关闭案例面板");
  assert.match(app, /function setTaskQueueOpen\(open\) \{[\s\S]*?setExamplesPanelOpen\(false\)/, "打开队列需关闭案例面板");
  assert.match(app, /examples-sidebar-open/, "案例面板需要独立 body 类做让位");
  assert.match(app, /els\.examplesBtn\.onclick/, "顶栏按钮接线");
  assert.match(app, /data-example-index/, "卡片带索引委托");
  for (const id of ["examplesPanel", "examplesBtn", "examplesCloseBtn", "examplesOpenBtn", "examplesGrid"]) {
    assert.ok(html.includes(`id="${id}"`), `index.html 缺少 #${id}`);
  }
  assert.match(html, /<button id="examplesBtn" class="track-icon-btn" title="案例" aria-label="案例">/, "顶栏按钮必须带 title 与 aria-label");
  assert.match(html, /<aside id="examplesPanel" class="examples-panel hidden" aria-label="案例">/, "面板 aside 就位");
  assert.match(html, /modules\/canvas-examples\.js\?v=/, "生成模块经 ?v= 引入");
  const styles = read("styles.css");
  assert.match(styles, /--examples-sidebar-width/, "面板宽度变量就位");
  assert.match(styles, /\.examples-panel \{/, "面板样式就位");
});

test("提取脚本纯函数：分桶/排序/净化/无名编组跳过", async () => {
  const script = await import(pathToFileURL(path.join(root, "tools", "build-canvas-examples.mjs")).href);
  const project = {
    pages: [{
      name: "案例演示",
      data: {
        nodes: [
          { id: "n1", type: "image", x: 100, y: 100, w: 240, h: 300, canvasGroupId: "g2", image: "data:image/webp;base64,AAA", taskId: "t9", generating: true, chatMessages: [{ role: "user" }] },
          { id: "n2", type: "text", x: 400, y: 110, w: 250, h: 180, canvasGroupId: "g2", outputPath: "E:/x.png" },
          { id: "m1", type: "text", x: 50, y: 50, w: 240, h: 160, canvasGroupId: "g1" },
          { id: "m2", type: "ai-image", x: 360, y: 60, w: 240, h: 420, canvasGroupId: "g1", prompt: "测试" },
          { id: "s1", type: "text", x: 900, y: 900, w: 240, h: 160, canvasGroupId: "g3" },
        ],
        edges: [
          { id: "e1", from: { node: "n1", port: "out" }, to: { node: "n2", port: "in" }, label: "" },
          { id: "e2", from: { node: "m1", port: "out" }, to: { node: "m2", port: "in" }, label: "" },
          { id: "e3", from: { node: "n2", port: "out" }, to: { node: "s1", port: "in" }, label: "跨组连线应被排除" },
        ],
        canvasGroupNames: { g1: "甲案例", g2: "乙案例" },
        canvasGroupFrames: { g2: { x: 84, y: 52, w: 572, h: 396 } },
        canvasGroupCollapsed: { g2: true },
      },
    }],
  };
  const examples = script.extractExamplesFromProject(project);
  assert.strictEqual(examples.length, 2, "单成员组与无名组都不成案例");
  // 排序按 frame.y 再 x：g1 无 frame 走拟合（y=50-48=2），g2 有 frame（y=52）→ g1 在前
  assert.deepStrictEqual(examples.map(example => example.title), ["甲案例", "乙案例"]);
  const [first, second] = examples;
  assert.strictEqual(first.id, "ex_g1");
  assert.ok(first.groupFrames.g1, "缺 frame 时按成员拟合外框");
  assert.strictEqual(first.groupFrames.g1.x, 50 - 16, "拟合外框左右 PAD 16");
  assert.strictEqual(first.groupFrames.g1.y, 50 - 48, "拟合外框顶部 PAD 48");
  assert.strictEqual(first.edges.length, 1, "只收组内连线");
  assert.strictEqual(second.edges.length, 1, "跨组连线被排除");
  const dirty = second.nodes.find(node => node.id === "n1");
  assert.strictEqual(dirty.generating, false);
  assert.strictEqual(dirty.taskId, null);
  assert.ok(!("chatMessages" in dirty), "对话历史必须剥除");
  assert.ok(dirty.image.startsWith("data:image/"), "缩略图 dataURL 保留");
  const cleaned = second.nodes.find(node => node.id === "n2");
  assert.ok(!("outputPath" in cleaned), "作者机器的导出路径剥除");
  assert.strictEqual(second.groupFrames.g2.h, 396, "已有 frame 原样保留");
});

test("提取脚本：找不到目标项目时报出项目名清单", async () => {
  const script = await import(pathToFileURL(path.join(root, "tools", "build-canvas-examples.mjs")).href);
  assert.throws(
    () => script.extractExamplesFromProject({ pages: [{ name: "项目1", data: { nodes: [] } }] }),
    /项目1/,
    "错误信息应包含现有项目名便于排查"
  );
});
