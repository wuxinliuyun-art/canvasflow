// AI绘图设置「模型管理」卡（2026-11-19，镜像 AI对话页签同款设计）
// 覆盖：imageModelToggles 勾选覆盖语义、catalogModels 勾选视图过滤、activeCatalog 不过滤
//（官渠固定路由/兜底安全）、normalize 对 hidden/取消勾选模型不回退、静态接线、目录条目、?v= 基线。
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const catalogSource = fs.readFileSync(path.join(root, "model-catalog.js"), "utf8");

// app.js 为 CRLF 行尾；顶层函数体以行首 "}" 结束。多声明切片直接 runInContext，不要括号包裹
// （多个顶层声明不是合法表达式；切片尾行注释会吞掉右括号）。
function sliceFn(name) {
  const marker = `function ${name}(`;
  const start = app.indexOf(marker);
  assert.ok(start >= 0, `app.js 缺少 ${name}`);
  const end = app.indexOf("\n}", start);
  assert.ok(end > start, `切片结尾未找到: ${name}`);
  return app.slice(start, end + 2);
}

const SLICES = [
  sliceFn("activeApiType"),
  sliceFn("imageModelEnabled"),
  sliceFn("activeCatalog"),
  sliceFn("modelCatalogEntry"),
  sliceFn("catalogModels"),
  sliceFn("normalizeAiNodeSettings"),
];

function makeContext(settings, catalog) {
  const ctx = { window: {}, console, state: { settings } };
  if (catalog) ctx.window.CANVASFLOW_MODEL_CATALOG = catalog;
  vm.createContext(ctx);
  for (const slice of SLICES) vm.runInContext(slice, ctx);
  return ctx;
}

const STUB_CATALOG = {
  agtoken: { defaultModel: "m-base", models: [
    { id: "m-base", label: "Base", quality: false, qualities: [], resolutions: ["1k"], sizes: ["1:1"] },
    { id: "m-hidden", label: "Hidden", hidden: true, quality: false, qualities: [], resolutions: ["1k"], sizes: ["1:1"] },
  ] },
  apimart: { defaultModel: "p-base", models: [{ id: "p-base", label: "P", quality: false, qualities: [], resolutions: ["1k"], sizes: ["1:1"] }] },
};

test("imageModelEnabled：缺省 = !hidden；勾选覆盖优先；站点作用域互不串", () => {
  const ctx = makeContext(
    { apiType: "agtoken", imageModelToggles: { agtoken: { "m-base": false, "m-hidden": true } } },
    STUB_CATALOG,
  );
  const enabled = vm.runInContext("imageModelEnabled", ctx);
  assert.strictEqual(enabled("agtoken", { id: "m-base", hidden: false }), false, "显式 false 覆盖缺省开");
  assert.strictEqual(enabled("agtoken", { id: "m-hidden", hidden: true }), true, "显式 true 覆盖缺省关");
  assert.strictEqual(enabled("agtoken", { id: "m-other", hidden: false }), true, "缺省 = 非 hidden 开");
  assert.strictEqual(enabled("agtoken", { id: "m-other2", hidden: true }), false, "缺省 = hidden 关");
  assert.strictEqual(enabled("apimart", { id: "m-base", hidden: false }), true, "apimart 无覆盖 → 缺省开（不串 agtoken 的取消勾选）");
});

test("catalogModels 只出勾选启用视图；activeCatalog 不过滤（官渠路由/兜底安全）", () => {
  const ctx = makeContext(
    { apiType: "agtoken", imageModelToggles: { agtoken: { "m-base": false, "m-hidden": true } } },
    STUB_CATALOG,
  );
  assert.strictEqual(JSON.stringify(vm.runInContext("catalogModels", ctx)().map(m => m.id)), JSON.stringify(["m-hidden"]));
  // modelCatalogEntry 对被取消勾选的模型仍然认可（normalize 不回退、渠道兜底目标可达）
  assert.ok(vm.runInContext("modelCatalogEntry", ctx)("m-base"), "取消勾选的模型目录条目必须仍可查到");
  const entry = vm.runInContext("modelCatalogEntry", ctx)("m-hidden");
  assert.ok(entry && entry.hidden === true);
});

test("normalizeAiNodeSettings：hidden/被取消勾选的模型不回退（官渠固定路由与兜底依赖此语义）", () => {
  const ctx = makeContext(
    { apiType: "agtoken", imageModelToggles: { agtoken: { "m-base": false, "m-hidden": true } } },
    STUB_CATALOG,
  );
  const normalize = vm.runInContext("normalizeAiNodeSettings", ctx);
  const keptHidden = normalize({ type: "ai-image", _model: "m-hidden", _resolution: "1k", _size: "1:1", _count: 1 });
  assert.strictEqual(keptHidden._model, "m-hidden", "勾选启用的 hidden 模型不回退");
  const keptDisabled = normalize({ type: "ai-image", _model: "m-base", _resolution: "1k", _size: "1:1", _count: 1 });
  assert.strictEqual(keptDisabled._model, "m-base", "被取消勾选的既有节点模型不回退（仅下拉不再提供）");
  const unknown = normalize({ type: "ai-image", _model: "m-nope", _resolution: "1k", _size: "1:1", _count: 1 });
  assert.strictEqual(unknown._model, "m-base", "目录里彻底不存在的模型仍回退默认");
});

test("静态接线：模型管理卡 DOM、事件、默认值键齐全；拉取功能已移除", () => {
  assert.match(html, /id="imageModelCardToggle"/);
  assert.match(html, /id="imageModelCardBody"/);
  assert.match(html, /id="imageModelManageList"/);
  assert.match(html, />模型管理</);
  assert.match(app, /imageModelCardToggle: \$\("imageModelCardToggle"\)/);
  assert.match(app, /imageModelManageList: \$\("imageModelManageList"\)/);
  assert.match(app, /if \(name === "ai"\) renderImageModelManageList\(\);/);
  const applySlice = sliceFn("applyApiTypeSettingsUi");
  assert.ok(applySlice.includes("populateDefaultModelOptions();") && applySlice.includes("renderImageModelManageList();"));
  for (const attr of ["data-image-model", "data-image-model-disable-all", "data-image-model-reset"]) {
    assert.ok(app.includes(attr), `app.js 缺少 ${attr}`);
  }
  assert.ok(app.includes('imageModelCardToggle.addEventListener'), "缺模型管理卡折叠头接线");
  // 两处 settings 默认值都带 imageModelToggles（初始 state + restoreData 合并默认）
  const defaultsCount = (app.match(/imageModelToggles: \{\}/g) || []).length;
  assert.ok(defaultsCount >= 2, `settings 默认值应至少两处含 imageModelToggles，实际 ${defaultsCount}`);
  // 拉取/添加机制已整体移除
  assert.ok(!app.includes("api/pricing"), "拉取功能已按要求移除，不应残留 agtoken pricing 直连");
  assert.ok(!app.includes("imageSiteModels"), "旧添加机制 settings 键不应残留");
  assert.ok(!html.includes("imageModelToggleList"), "旧可用模型卡容器不应残留");
});

test("新键为非密钥：persistPages 与 server.js 剥离清单均不含 imageModelToggles", () => {
  const persistSlice = sliceFn("persistPages");
  assert.ok(!persistSlice.includes("imageModelToggles"), "imageModelToggles 是非密钥，不得进剥离/清空清单");
  assert.ok(!server.includes("imageModelToggles"), "server.js 不得剥离非密钥设置键 imageModelToggles");
  assert.match(app, /settings\.apiKey = "";/); // 既有剥离逻辑保持不变
});

test("model-catalog：官渠系全部 hidden；2.5 标准型与 flare 官渠已删；2.6 系勾选启用；gpt-image-2官渠仍是兜底条目", () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(catalogSource, ctx);
  const agtoken = ctx.window.CANVASFLOW_MODEL_CATALOG.agtoken.models;
  const byId = Object.fromEntries(agtoken.map(m => [m.id, m]));
  assert.ok(!byId["gpt-image-2.5-flare官渠"], "flare 官渠不进目录：flare 是快速看效果的便宜档，勿用官渠满血贵渠道（2026-11-19 拍板）");
  assert.ok(!byId["gpt-image-2.5"], "gpt-image-2.5 标准型已删（与 Flare/Sunburst 重复），旧存档引用走 normalize 回退");
  for (const id of ["gpt-image-2官渠", "gpt-image-2.5-sunburst官渠", "gpt-image-2.6-flare", "gpt-image-2.6-sunburst"]) {
    assert.ok(byId[id], `agtoken 目录缺少 ${id}`);
    assert.strictEqual(byId[id].hidden, true, `${id} 应为 hidden（模型管理勾选启用）`);
  }
  assert.ok(byId["gpt-image-2官渠"].note, "官渠条目应带计费说明 note");
  assert.strictEqual(byId["gpt-image-2.6-flare"].quality, true);
  assert.strictEqual(JSON.stringify(byId["gpt-image-2.6-flare"].qualities), JSON.stringify(["low", "medium", "high", "xhigh", "max"]));
  assert.strictEqual(byId["gpt-image-2.5-sunburst官渠"].quality, false);
  // 普通渠道不受影响：gpt-image-2 / flare / sunburst / nano-banana 仍默认进下拉
  for (const id of ["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "nano-banana-2", "nano-banana-pro"]) {
    assert.strictEqual(byId[id].hidden, undefined, `${id} 应保持可见`);
  }
});

test("默认模型回退走勾选视图：catalogModels 为空时兜底目录 defaultModel", () => {
  const ctx = makeContext({ apiType: "agtoken", imageModelToggles: { agtoken: { "m-base": false } } }, STUB_CATALOG);
  assert.strictEqual(vm.runInContext("catalogModels", ctx)().length, 0, "唯一可见模型被取消勾选后勾选视图为空");
  const fallback = vm.runInContext("catalogModels", ctx)()[0]?.id || vm.runInContext("activeCatalog", ctx)("agtoken").defaultModel;
  assert.strictEqual(fallback, "m-base", "全不选时默认模型兜底到目录 defaultModel");
});

test("?v= 基线：app.js 递增；model-catalog 与 canvas-runtime 成对", () => {
  assert.match(html, /app\.js\?v=20261127-composerpick1/);
  const catalogMatch = html.match(/model-catalog\.js\?v=([^"]+)"/);
  const runtimeMatch = html.match(/canvas-runtime\.js\?v=([^"]+)"/);
  assert.ok(catalogMatch && runtimeMatch, "index.html 缺少 model-catalog/canvas-runtime 版本参数");
  assert.strictEqual(catalogMatch[1], runtimeMatch[1], "model-catalog 与 canvas-runtime 必须同版本成对");
  assert.notStrictEqual(catalogMatch[1], "20261114-videoapimart4");
});
