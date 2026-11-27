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
  // 组框始终现算（缓存帧可能过期）：g2 成员 n1 image(100,100,240,300) + n2 text(400,110,250,180)
  // → right 650 / bottom 400，PAD 后 x=84 y=52 w=582 h=364
  assert.strictEqual(second.groupFrames.g2.h, 364, "组框按成员现算（含类型高度下限）");
});

test("提取脚本：找不到目标项目时报出项目名清单", async () => {
  const script = await import(pathToFileURL(path.join(root, "tools", "build-canvas-examples.mjs")).href);
  assert.throws(
    () => script.extractExamplesFromProject({ pages: [{ name: "项目1", data: { nodes: [] } }] }),
    /项目1/,
    "错误信息应包含现有项目名便于排查"
  );
});

test("合并：新案例并入现有案例，撞号加 -2 后缀，同标题沿用既有 id", async () => {
  const script = await import(pathToFileURL(path.join(root, "tools", "build-canvas-examples.mjs")).href);
  const existing = [
    { id: "ex_g1", title: "旧案例", nodes: [], edges: [] },
    { id: "ex_g2", title: "占位案例", nodes: [], edges: [] },
  ];
  const fresh = [
    { id: "ex_g2", title: "新编组（与占位案例撞号）", nodes: [], edges: [] },
    { id: "ex_g9", title: "全新案例", nodes: [], edges: [] },
    { id: "ex_g1", title: "旧案例", nodes: [], edges: [] },
  ];
  const merged = script.mergeExamples(JSON.parse(JSON.stringify(fresh)), JSON.parse(JSON.stringify(existing)));
  assert.strictEqual(merged.length, 4, "2 保留 + 撞号追加 + 全新追加；同标题更新不重复");
  assert.strictEqual(merged[0].id, "ex_g1", "同标题案例沿用既有 id（封面映射稳定）");
  assert.strictEqual(merged[0].title, "旧案例");
  assert.strictEqual(merged[1].id, "ex_g2", "占位案例保留");
  assert.strictEqual(merged[2].id, "ex_g2-2", "撞号后来者加 -2 后缀");
  assert.strictEqual(merged[2].title, "新编组（与占位案例撞号）");
  assert.strictEqual(merged[3].id, "ex_g9");
  // 幂等：把同一批再合一次不会复制出重复项
  const rerun = script.mergeExamples(JSON.parse(JSON.stringify(fresh)), JSON.parse(JSON.stringify(merged)));
  assert.strictEqual(rerun.length, 4, "重跑合并保持幂等");
  assert.ok(rerun.every(example => !example.id.endsWith("-3")), "重跑不产生新后缀");
});

test("合并：现有产物模块解析（含真实模块），坏产物按空处理", async () => {
  const script = await import(pathToFileURL(path.join(root, "tools", "build-canvas-examples.mjs")).href);
  const real = script.loadExistingExamples(read("modules/canvas-examples.js"));
  assert.ok(Array.isArray(real) && real.length >= 5, "真实产物模块应解析出案例清单");
  assert.ok(script.loadExistingExamples("window.CANVASFLOW_EXAMPLES = [不是JSON") .length === 0, "坏产物按空数组处理");
  assert.ok(script.loadExistingExamples("").length === 0, "空源按空数组处理");
});

test("生成模块：新手引导编组已并入（连续修改撞号 -2，老案例 id 不变）", () => {
  const examples = loadExamplesModule();
  const titles = examples.map(example => example.title);
  for (const title of ["连续修改", "材质修改", "文字生成图片并抠图"]) {
    assert.ok(titles.includes(title), `新手引导编组「${title}」应已并入案例库`);
  }
  assert.strictEqual(examples.find(example => example.title === "连续修改").id, "ex_canvas-group20-2",
    "与「作品集手绘」撞 canvas-group20 号，后来者加 -2");
  assert.strictEqual(examples.find(example => example.title === "作品集手绘").id, "ex_canvas-group20",
    "先收录的老案例 id 保持稳定（封面映射不破）");
  assert.strictEqual(examples.find(example => example.title === "材质修改").id, "ex_canvas-group31");
  assert.strictEqual(examples.find(example => example.title === "文字生成图片并抠图").id, "ex_canvas-group6");
});

test("真实案例封面：内容摘要与随包 PNG 一致，替换截图后不复用旧缓存", () => {
  const { createHash } = require("node:crypto");
  for (const example of loadExamplesModule()) {
    const [file, query] = example.cover.split("?");
    const bytes = fs.readFileSync(path.join(root, file));
    assert.strictEqual(bytes.subarray(1, 4).toString(), "PNG");
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    assert.strictEqual(query, `v=${digest}`, example.title);
  }
});

test("作品集手绘：全部输入沿组内连线可到达 AI 绘图，保留原案例 id", () => {
  const example = loadExamplesModule().find(e => e.id === "ex_canvas-group20");
  const ai = example.nodes.find(n => n.type === "ai-image");
  for (const node of example.nodes.filter(n => n.id !== ai.id)) {
    const seen = new Set([node.id]);
    for (const id of seen) for (const edge of example.edges.filter(e => e.from.node === id)) seen.add(edge.to.node);
    assert.ok(seen.has(ai.id), `${node.type} 必须连通 AI`);
  }
});

test("案例英文：标题、动态数量、价格、语言切换与英文封面同步", () => {
  const app = read("app.js");
  const dictionary = app.slice(app.indexOf("const UI_EN ="), app.indexOf("let uiLanguage ="));
  const translation = app.slice(app.indexOf("function translateEnglishString("), app.indexOf("function translateUiTree("));
  const render = app.slice(app.indexOf("function renderExamplesPanel("), app.indexOf('\n$("settingsBtn").onclick', app.indexOf("function renderExamplesPanel(")));
  const grid = { innerHTML: "", querySelectorAll: () => [] };
  const searchInput = { value: "" };
  const examples = loadExamplesModule();
  const harness = new Function("window", "els", "escapeHtml", `${dictionary}\nlet uiLanguage = 'en';\n${translation}\n${render}\nreturn { translateEnglishString, setLanguage(language) { uiLanguage = language; renderExamplesPanel(); } };`)({ CANVASFLOW_EXAMPLES: examples }, { examplesGrid: grid, examplesSearchInput: searchInput }, s => s);
  for (const e of examples) assert.doesNotMatch(harness.translateEnglishString(e.title), /[\u4e00-\u9fff]/, e.title);
  assert.equal(harness.translateEnglishString("作品集手绘 · 3 个节点"), "Portfolio Sketching · 3 nodes");
  assert.equal(harness.translateEnglishString("收纳"), "Collapse");
  assert.doesNotMatch(harness.translateEnglishString("预计约 ¥0.02（1K ¥0.02/张 × 1 张）"), /[\u4e00-\u9fff]/);
  harness.setLanguage("en");
  assert.match(grid.innerHTML, /Portfolio Sketching/);
  assert.doesNotMatch(grid.innerHTML, /example-card-body|connections/);
  assert.match(grid.innerHTML, /ex_canvas-group20\.en\.png/);
  harness.setLanguage("zh-CN");
  assert.match(grid.innerHTML, /作品集手绘/);
  assert.doesNotMatch(grid.innerHTML, /\.en\.png/);
  searchInput.value = "  PORTFOLIO sketching  ";
  harness.setLanguage("en");
  assert.equal((grid.innerHTML.match(/class="example-item"/g) || []).length, 1);
  assert.match(grid.innerHTML, /data-example-index="0"/);
  searchInput.value = "草图转线稿";
  harness.setLanguage("en");
  const originalIndex = examples.findIndex(e => e.title === "草图转线稿");
  assert.match(grid.innerHTML, new RegExp(`data-example-index="${originalIndex}"`));
  searchInput.value = "不存在的案例123xyz";
  harness.setLanguage("en");
  assert.match(grid.innerHTML, /No matching examples/);
  assert.doesNotMatch(grid.innerHTML, /class="example-item"/);
  searchInput.value = "";
  harness.setLanguage("zh-CN");
  assert.equal((grid.innerHTML.match(/class="example-item"/g) || []).length, examples.length);
  assert.match(app, /function setUiLanguage\([\s\S]*?renderExamplesPanel\(\)/);
  for (const e of examples) {
    const [file, query] = e.coverEn.split("?");
    const digest = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex").slice(0, 12);
    assert.equal(query, `v=${digest}`);
  }
});
