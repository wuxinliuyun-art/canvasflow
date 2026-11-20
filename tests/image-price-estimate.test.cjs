// AI 绘图节点「估算价格」（2026-11-20）：
// ①目录价格数据完整性（currency + priceByResolution/pricePerImage/pricePerCall）
// ②牌价数值回归（agtoken 分档 ¥0.02/0.03/0.04、官渠 ¥0.15、nano ¥0.1；APIMart ext 分档 $）
// ③aiNodePriceEstimateText 估算行为（vm 切片真实源码）
// ④APIMart flare/sunburst quality 五档启用 + ext 提交透传 quality（静态断言）
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const catalog = js => {
  const window = {};
  const sandbox = vm.createContext({ window });
  vm.runInContext(fs.readFileSync(path.join(root, "model-catalog.js"), "utf8"), sandbox);
  return window.CANVASFLOW_MODEL_CATALOG;
};

test("目录价格数据：两桶都有 currency；非 Token 计费的模型都带牌价字段且覆盖分辨率档", () => {
  const catalogs = catalog();
  assert.equal(catalogs.apimart.currency, "积分");
  assert.equal(catalogs.agtoken.currency, "¥");
  // Token 计费（无每张牌价）的白名单：apimart gpt-image-2-official / gpt-image-2.5
  const tokenBilled = new Set(["gpt-image-2-official", "gpt-image-2.5"]);
  for (const [apiType, bucket] of Object.entries(catalogs)) {
    for (const entry of bucket.models) {
      const priced = entry.priceByResolution || Number.isFinite(entry.pricePerImage) || Number.isFinite(entry.pricePerCall);
      if (tokenBilled.has(entry.id)) {
        assert.ok(!priced, `${apiType}/${entry.id} 按 Token 计费，不应有每张牌价`);
        continue;
      }
      assert.ok(priced, `${apiType}/${entry.id} 缺少牌价字段（估算价格会落空）`);
      if (entry.priceByResolution) {
        const keys = Object.keys(entry.priceByResolution);
        for (const resolution of entry.resolutions) {
          assert.ok(keys.includes(resolution), `${apiType}/${entry.id} 分辨率 ${resolution} 无牌价`);
          assert.ok(Number.isFinite(entry.priceByResolution[resolution]) && entry.priceByResolution[resolution] > 0);
        }
      }
    }
  }
});

test("牌价数值回归：agtoken 分档/官渠/nano，APIMart ext 分档", () => {
  const catalogs = catalog();
  const agtoken = Object.fromEntries(catalogs.agtoken.models.map(m => [m.id, m]));
  const apimart = Object.fromEntries(catalogs.apimart.models.map(m => [m.id, m]));
  assert.deepEqual(agtoken["gpt-image-2.5-flare"].priceByResolution, { "1k": 0.02, "2k": 0.03, "4k": 0.04 });
  assert.deepEqual(agtoken["gpt-image-2.5-sunburst"].priceByResolution, { "1k": 0.02, "2k": 0.03, "4k": 0.04 });
  assert.deepEqual(agtoken["gpt-image-2"].priceByResolution, { "1k": 0.02, "2k": 0.03 });
  assert.equal(agtoken["gpt-image-2官渠"].pricePerImage, 0.15);
  assert.equal(agtoken["gpt-image-2.5-sunburst官渠"].pricePerImage, 0.15);
  assert.equal(agtoken["nano-banana-2"].pricePerImage, 0.1);
  assert.equal(agtoken["nano-banana-pro"].pricePerImage, 0.1);
  // flare/sunburst 走 gpt-image-2.5-ext 的 version_resolution 牌价
  assert.deepEqual(apimart["gpt-image-2.5-flare"].priceByResolution, { "1k": 0.010625, "2k": 0.0375, "4k": 0.05 });
  assert.deepEqual(apimart["gpt-image-2.5-sunburst"].priceByResolution, { "1k": 0.010625, "2k": 0.0375, "4k": 0.05 });
  assert.deepEqual(apimart["gpt-image-2"].priceByResolution, { "1k": 0.010625, "2k": 0.01875, "4k": 0.0275 });
  assert.deepEqual(apimart["gemini-3.1-flash-image-preview"].priceByResolution, { "1k": 0.015, "2k": 0.0175, "4k": 0.0225 });
  assert.deepEqual(apimart["gemini-3-pro-image-preview"].priceByResolution, { "1k": 0.0375, "2k": 0.0375, "4k": 0.05 });
  assert.equal(apimart.midjourney.pricePerCall, 0.0563);
});

function loadEstimate(catalogs, activeApiType) {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf("function aiNodePriceEstimateText");
  const end = source.indexOf("function imageModelPricingHtml");
  assert.ok(start > 0 && end > start, "app.js 中找不到估算函数切片标记");
  const slice = source.slice(start, end);
  const context = vm.createContext({
    window: { CANVASFLOW_MODEL_CATALOG: catalogs },
    activeApiType: () => activeApiType,
    Number, String, Math,
  });
  // 单个函数声明的切片用括号包裹后是表达式：完成值即函数本身（不会挂到 context 全局）
  return vm.runInContext(`(${slice}\n)`, context);
}

test("估算函数：分辨率分档 × 张数", () => {
  const catalogs = catalog();
  const estimate = loadEstimate(catalogs, "agtoken");
  const flare = catalogs.agtoken.models.find(m => m.id === "gpt-image-2.5-flare");
  assert.equal(
    estimate(flare, { _resolution: "2k", _count: 3 }, "agtoken"),
    "预计约 ¥0.09（2K ¥0.03/张 × 3 张）",
  );
  // 张数缺省按 1
  assert.equal(
    estimate(flare, { _resolution: "4k" }, "agtoken"),
    "预计约 ¥0.04（4K ¥0.04/张 × 1 张）",
  );
});

test("估算函数：各档同价 / 按次计费 / 无牌价返回空", () => {
  const catalogs = catalog();
  const estimate = loadEstimate(catalogs, "agtoken");
  const nano = catalogs.agtoken.models.find(m => m.id === "nano-banana-2");
  assert.equal(
    estimate(nano, { _resolution: "4k", _count: 2 }, "agtoken"),
    "预计约 ¥0.2（各档同价 ¥0.1/张 × 2 张）",
  );
  const mj = catalogs.apimart.models.find(m => m.id === "midjourney");
  assert.equal(
    estimate(mj, { _count: 2 }, "apimart"),
    "预计约 0.1126 积分（按动作默认档 0.0563 积分/次 × 2 次）",
  );
  const tokenBilled = catalogs.apimart.models.find(m => m.id === "gpt-image-2.5");
  assert.equal(estimate(tokenBilled, { _count: 2 }, "apimart"), "");
  assert.equal(estimate(null, { _count: 2 }, "apimart"), "");
});

test("APIMart flare/sunburst 启用 quality 五档，与 agtoken 同款", () => {
  const catalogs = catalog();
  const qualities = ["low", "medium", "high", "xhigh", "max"];
  for (const id of ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]) {
    assert.equal(catalogs.apimart.models.find(m => m.id === id).quality, true, `apimart/${id} 应启用 quality`);
    assert.deepEqual(catalogs.apimart.models.find(m => m.id === id).qualities, qualities);
    assert.deepEqual(catalogs.agtoken.models.find(m => m.id === id).qualities, qualities, "agtoken 同款回归");
  }
});

test("接线：ext 提交透传 quality、价格行挂估算、mc/cr 版本成对", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n/g, "\n");
  assert.ok(app.includes("(extVersion && modelSupportsQuality(node._model))"), "ext 分支应按目录声明透传 quality");
  assert.ok(app.includes("aiNodePriceEstimateText(entry, node, apiType)"), "价格行应挂估算文本");
  assert.ok(app.includes("function aiNodePriceEstimateText"), "估算函数应存在");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /model-catalog\.js\?v=20261120-aiprice2/);
  assert.match(html, /canvas-runtime\.js\?v=20261120-aiprice2/);
});
