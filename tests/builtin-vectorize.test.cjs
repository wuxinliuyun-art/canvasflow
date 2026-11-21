const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

test("built-in vectorize is wired independently of the extension service", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /const BUILTIN_VECTORIZE_TOOL = Object\.freeze\(/);
  assert.match(app, /id: "image-vectorize"/);
  assert.match(app, /const runner = node\.toolMeta\.id === BUILTIN_VECTORIZE_TOOL\.id \? runBuiltinVectorize/);
  assert.match(app, /filter\(ext => !BUILTIN_TOOL_IDS\.has\(ext\?\.id\)\)/);
  assert.match(app, /\["添加矢量化节点", \(\) => addBuiltinVectorizeNode/);
});

test("browser VTracer WASM loader converts an encoded image", async () => {
  const source = path.join(root, "assets", "vendor", "vtracer", "vtracer-wasm.js");
  const wasmPath = path.join(root, "assets", "vendor", "vtracer", "vtracer_wasm_bg.wasm");
  const temporaryModule = path.join(os.tmpdir(), `canvasflow-vtracer-${process.pid}-${Date.now()}.mjs`);
  fs.copyFileSync(source, temporaryModule);
  try {
    const module = await import(`${pathToFileURL(temporaryModule).href}?v=${Date.now()}`);
    const wasmUrl = `data:application/wasm;base64,${fs.readFileSync(wasmPath).toString("base64")}`;
    await module.initVTracerWasm(wasmUrl);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const svg = module.vectorize_bytes(png, { preset: "poster", mode: "spline" });
    assert.match(svg, /<svg\b/);
  } finally {
    fs.rmSync(temporaryModule, { force: true });
  }
});

test("all release paths include the vectorize WASM assets and exclude the old preset", () => {
  const csproj = fs.readFileSync(path.join(root, "desktop-dotnet", "CanvasFlow.Desktop.csproj"), "utf8");
  const windowsBuild = fs.readFileSync(path.join(root, "build-dotnet.cmd"), "utf8");
  const installer = fs.readFileSync(path.join(root, "installer", "CanvasFlow.iss"), "utf8");
  const macBuild = fs.readFileSync(path.join(root, "build-mac.ps1"), "utf8");
  const webBuild = fs.readFileSync(path.join(root, "build-web-update.ps1"), "utf8");
  assert.match(csproj, /assets\\vendor\\vtracer/);
  // 2026-11-21：拓展目录不再复制进 publish（安装器本就 Excludes extensions-presets，拓展独立分发；
  // 且杀软拦截运行时 DLL 写入 publish 会静默终止构建进程）——构建脚本只搬「拓展脚本规范.md」
  assert.doesNotMatch(windowsBuild, /image-vectorize/);
  assert.doesNotMatch(windowsBuild, /for \/d %%E in/);
  assert.doesNotMatch(installer, /extensions-presets\\图片矢量化/);
  assert.match(macBuild, /vtracer_wasm_bg\.wasm/);
  assert.match(webBuild, /vtracer_wasm_bg\.wasm/);
});

test("PPT and auto-matting are built-in and their old presets are excluded", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const installer = fs.readFileSync(path.join(root, "installer", "CanvasFlow.iss"), "utf8");
  assert.match(app, /const BUILTIN_PPT_TOOL = Object\.freeze\(/);
  assert.match(app, /name: "图片置入ppt"/);
  assert.match(app, /const BUILTIN_MATTING_TOOL = Object\.freeze\(/);
  assert.match(app, /runBuiltinPpt/);
  assert.match(app, /runBuiltinMatting/);
  // ort.min.js 1.23.2 官方默认构建即 JSEP 版，只认 .jsep.* 产物；wasmPaths 必须是绝对 URL——
  // 相对前缀会被 ort 按 ort.min.js 自身 URL 解析出双路径（canvasflow.local/assets/vendor/onnxruntime/assets/vendor/onnxruntime/…）
  assert.match(app, /ort\.env\.wasm\.wasmPaths = new URL\("\.\/assets\/vendor\/onnxruntime\/", location\.href\)\.href/);
  assert.doesNotMatch(installer, /extensions-presets\\图片置入ppt/);
  assert.doesNotMatch(installer, /extensions-presets\\自动抠图-U2Net/);
  // 自动抠图-通用（BiRefNet，权重 928MB）只进仓库 extensions-presets 供源码桌面模式扫描，
  // 安装包独立分发（2026-11-21 起构建脚本不再复制任何拓展目录进 publish）
  assert.doesNotMatch(installer, /extensions-presets\\自动抠图-通用/);
});

test("vectorize/ppt/angle entries live inside the 拓展 submenu in both context menus", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  // 空白处右键：拓展子菜单 = 内置四项（矢量化/ppt/自动抠图/角度变化）+ 脚本拓展，顶层不再散落
  assert.match(app, /\["拓展", \[\s*\["添加矢量化节点", \(\) => addBuiltinVectorizeNode\(p\.x, p\.y\)\],\s*\["添加图片置入ppt节点"/);
  assert.match(app, /\["添加图片置入ppt节点", \(\) => addBuiltinToolNode\(BUILTIN_PPT_TOOL, p\.x, p\.y\)\],\s*\["添加自动抠图节点", \(\) => addBuiltinToolNode\(BUILTIN_MATTING_TOOL, p\.x, p\.y\)\],\s*\["角度变化", \(\) => addAngleImageNode\(p\.x, p\.y, \[\]\)\],\s*\.\.\.toolMenuItems\(p\)/);
  assert.doesNotMatch(app, /\["拓展", toolMenuItems\(p\)\]/);
  // 2026-11-14 用户要求：任何界面的自动抠图都放拓展里，空白处菜单顶层不再单列
  assert.doesNotMatch(app, /\["添加AI绘图节点", \(\) => addAiImageNode\(p\.x, p\.y, \[\]\)\],\s*\["添加自动抠图节点"/);
  // 选中节点右键：图片矢量化/图片置入ppt/自动抠图/角度变化 收进拓展子菜单，角度变化不再单列在底部
  assert.match(app, /\["拓展", \[\s*\["图片矢量化", vectorizeAction\],\s*\["图片置入ppt", \(\) => addConnectedBuiltinTool\(BUILTIN_PPT_TOOL\)\],\s*\["自动抠图", \(\) => addConnectedBuiltinTool\(BUILTIN_MATTING_TOOL\)\]/);
  assert.match(app, /state\.selected\.size === 1 \? \[\["角度变化", \(\) => \{\s*extensionSources\.forEach\(source => addAngleImageNode\(source\.x \+ 290, source\.y, \[source\.id\]\)\);\s*\}\]\] : \[\]\),\s*\]\]\] : \[\]\)/);
  assert.doesNotMatch(app, /\[\["角度变化", \(\) => \{\s*extensionSources\.forEach\(source => addAngleImageNode\(source\.x \+ 290, source\.y, \[source\.id\]\)\);\s*\}\]\] : \[\]\),\s*\["断开连接"/);
  // 2026-11-14 用户要求：自动抠图收进拓展子菜单，不再在节点菜单顶层单列
  assert.doesNotMatch(app, /\.\.\.\(extensionSources\.length \? \[\["自动抠图", \(\) => addConnectedBuiltinTool\(BUILTIN_MATTING_TOOL\)\]\] : \[\]\)/);
});

test("vectorize node exposes concrete WASM params and maps tool values with coercion", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  // 参数键经探针实测全部生效；colormode（黑白）上游 WASM 不支持，禁止上架
  assert.match(app, /key: "maxColors", label: "颜色数上限", type: "slider", min: 2, max: 64, default: 12/);
  assert.match(app, /key: "filterSpeckle", label: "精度", type: "slider", min: 0, max: 16, default: 3/);
  assert.match(app, /key: "layerDifference", label: "近色合并", type: "slider", min: 0, max: 128, default: 16/);
  assert.match(app, /key: "fitOutline", label: "平滑曲线", type: "toggle", default: false/);
  assert.doesNotMatch(app, /key: "fitStrength"/);
  assert.doesNotMatch(app, /key: "mergeStrength"/);
  assert.doesNotMatch(app, /key: "colormode"/);
  // 线条模式已删（2026-11-14 用户拍板只用平滑曲线），折线不可达
  assert.doesNotMatch(app, /key: "curveMode"/);
  assert.doesNotMatch(app, /直线折线/);

  // 切片真实源码验证映射：输入框来的数值是字符串，必须 Number 化 + 钳制
  const slice = app.match(/function builtinVectorizeOptions\(values = \{\}\) \{[\s\S]*?\n\}/);
  assert.ok(slice, "builtinVectorizeOptions slice must exist");
  const builtinVectorizeOptions = new Function(`${slice[0]}\nreturn builtinVectorizeOptions;`)();
  assert.deepEqual(builtinVectorizeOptions({}), {
    preset: "poster", mode: "spline", hierarchical: "cutout",
    maxColors: 12, filterSpeckle: 3, layerDifference: 16, simplify: 0, optimize: 1,
  });
  assert.equal(builtinVectorizeOptions({ curveMode: "直线折线" }).mode, "spline"); // 旧存档残留折线选择被忽略
  assert.equal(builtinVectorizeOptions({ fitOutline: true }).simplify, 1.25);
  assert.equal(builtinVectorizeOptions({ editableLayers: true }).hierarchical, "stacked");
  assert.equal(builtinVectorizeOptions({ maxColors: "999" }).maxColors, 64);
  assert.equal(builtinVectorizeOptions({ maxColors: "1" }).maxColors, 2);
  assert.equal(builtinVectorizeOptions({ filterSpeckle: "-5" }).filterSpeckle, 0);
  assert.equal(builtinVectorizeOptions({ layerDifference: "abc" }).layerDifference, 16);
  assert.equal(builtinVectorizeOptions({ maxColors: "7.6" }).maxColors, 8);
});

test("vectorize result previews inside the tool node and opens the parameter editor", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  // 执行后捕获首张 SVG 做节点内预览（限长防存档膨胀），点击进灯箱
  assert.match(app, /node\.vectorPreview = `data:image\/svg\+xml;base64,\$\{file\.data\}`/);
  assert.match(app, /!previewCaptured && file\.data\.length <= 900000/);
  assert.match(app, /class="tool-node-preview" data-role="tool-preview"/);
  assert.match(app, /data-role="tool-preview"/);
  assert.match(app, /if \(nodeElement\) openVectorPreviewEditor\(nodeElement\.dataset\.id\)/);
  // 结果图片节点带 outputPath（与落盘 savedPaths 同下标）：右键「打开生成图片所在文件夹」按它生效
  assert.match(app, /preview\.outputPath = String\(savedPaths\[index\] \|\| ""\)/);
  assert.match(app, /selectedNode\?\.outputPath \? \[\["打开生成图片所在文件夹", \(\) => openGeneratedFileLocation\(selectedNode\)\]\]/);
});

test("basic context menu entries are resident and cannot be hidden", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  // 用户划线点名的常驻集合：任何设置（含历史 hiddenMenuItems 残留）都隐藏不了
  assert.match(app, /const RESIDENT_CONTEXT_MENU_ITEMS = new Set\(\[\s*"粘贴节点", "添加文字节点", "添加图片节点", "添加AI绘图节点", "添加AI视频节点", "添加视频引用节点", "添加对话节点", "拓展",\s*\]\)/);
  assert.match(app, /if \(RESIDENT_CONTEXT_MENU_ITEMS\.has\(label\)\) return false;/);
  // 管理清单不再包含常驻项；AI 视频退出常规页开关双写（入口恒显）
  const managerBlock = app.match(/const CONTEXT_MENU_MANAGER_GROUPS = \[[\s\S]*?\n\];/)[0];
  for (const resident of ["粘贴节点", "添加文字节点", "添加图片节点", "添加AI绘图节点", "添加AI视频节点", "添加视频引用节点", "添加对话节点", "拓展"]) {
    assert.ok(!managerBlock.includes(resident), `manager list must not contain resident item: ${resident}`);
  }
  assert.ok(!managerBlock.includes("添加调色盘") === false, "manager keeps non-resident items");
  assert.match(app, /const CONTEXT_MENU_FLAG_ITEMS = \{\s*"添加浏览器生图节点": "showBrowserNodeMenu",/);
  assert.doesNotMatch(app, /"添加AI视频节点": "showVideoNodeMenu"/);
  // AI 视频入口无条件加入空白处菜单；常规页开关 DOM/els/同步/监听四处全部移除
  assert.match(app, /items\.push\(\["添加AI视频节点", \(\) => addAiVideoNode\(p\.x, p\.y, \[\]\)\], \["添加视频引用节点", \(\) => addVideoRefNode\(p\.x, p\.y\)\], \["添加对话节点"/);
  assert.ok(!index.includes("showVideoNodeMenuToggle"), "settings card must drop the AI video toggle");
  assert.doesNotMatch(app, /els\.showVideoNodeMenu/);
});

test("vectorize preview is live: debounce recompute wired to params and edges", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  // 实时预览引擎：防抖重算 + 签名去重（输入/参数未变不重算）+ 低清上限 + 过期序号丢弃
  assert.match(app, /const VECTOR_PREVIEW_DEBOUNCE_MS = 400;/);
  assert.match(app, /const VECTOR_PREVIEW_MAX_EDGE = 2048;/);
  assert.match(app, /async function updateVectorPreview\(nodeId\)/);
  assert.match(app, /module\.vectorize_bytes\(base64ToBytes\(comma >= 0 \? sourceData\.slice\(comma \+ 1\) : sourceData\), builtinVectorizeOptions\(runningNode\.toolValues \|\| \{\}\)\)/);
  // 触发点：参数变化 / 连线增删 / 插入连线 / 断开连接 / 节点创建（带源连线）
  assert.match(app, /if \(node\.toolMeta\?\.id === BUILTIN_VECTORIZE_TOOL\.id\) updateVectorPreview\(node\.id\);/);
  assert.match(app, /if \(target\.type === "ai-video"\) refreshAiVideoPrompt\(toNode\);\s*notifyVectorizeInputsChanged\(\[toNode\]\);/);
  assert.match(app, /notifyVectorizeInputsChanged\(\[edge\.from\.node, edge\.to\.node\]\);/);
  assert.match(app, /notifyVectorizeInputsChanged\(\[nodeId, toNode\.id\]\);/);
  assert.match(app, /notifyVectorizeInputsChanged\(\[\.\.\.affected\]\);/);
  assert.match(app, /updateVectorPreview\(node\.id\);\s*return node;\s*\}/);
});
