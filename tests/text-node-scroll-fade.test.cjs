const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("function syncTextNodeScrollEdges(");
const end = source.indexOf('els.nodes.addEventListener("input"', start);
assert.ok(start >= 0 && end > start, "scroll edge sync block should exist in app.js");

function makeScroller(scrollTop, clientHeight, scrollHeight) {
  return { scrollTop, clientHeight, scrollHeight };
}

function makeNodeEl(opts = {}) {
  const classes = new Set(opts.classes || []);
  return {
    classes,
    classList: {
      toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); },
      contains: name => classes.has(name),
    },
    querySelector: sel => (opts.scrollers || {})[sel] || null,
  };
}

function setup(nodes) {
  // nodes: [{ id, type, el }]
  const elById = new Map(nodes.map(n => [n.id, n.el]));
  const nodeById = new Map(nodes.map(n => [n.id, { id: n.id, type: n.type }]));
  const context = {
    state: { nodes: nodes.map(n => ({ id: n.id, type: n.type })) },
    findNode: id => nodeById.get(id) || null,
    els: { nodes: { querySelector: sel => { const m = /data-id="([^"]+)"/.exec(sel); return m ? elById.get(m[1]) || null : null; } } },
  };
  vm.runInNewContext(source.slice(start, end) + "\nthis.sync = syncTextNodeScrollEdges;", context);
  return context;
}

test("short fully visible text shows no fade flags", () => {
  const el = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(0, 120, 120) } });
  const ctx = setup([{ id: "n1", type: "text", el }]);
  ctx.sync();
  assert.equal(el.classes.has("has-scroll-before"), false);
  assert.equal(el.classes.has("has-scroll-after"), false);
});

test("top of long text fades only the bottom edge", () => {
  const el = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(0, 120, 500) } });
  const ctx = setup([{ id: "n1", type: "text", el }]);
  ctx.sync();
  assert.equal(el.classes.has("has-scroll-before"), false);
  assert.equal(el.classes.has("has-scroll-after"), true);
});

test("middle of long text fades both edges", () => {
  const el = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(200, 120, 500) } });
  const ctx = setup([{ id: "n1", type: "text", el }]);
  ctx.sync();
  assert.equal(el.classes.has("has-scroll-before"), true);
  assert.equal(el.classes.has("has-scroll-after"), true);
});

test("bottom of long text fades only the top edge", () => {
  const el = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(380, 120, 500) } });
  const ctx = setup([{ id: "n1", type: "text", el }]);
  ctx.sync();
  assert.equal(el.classes.has("has-scroll-before"), true);
  assert.equal(el.classes.has("has-scroll-after"), false);
});

test("editing mode measures the textarea, preview mode measures the preview", () => {
  const preview = makeScroller(0, 120, 500);   // 预览态：底部有隐藏内容
  const textarea = makeScroller(480, 120, 500); // 编辑态：已滚到底部
  const el = makeNodeEl({ scrollers: { ".text-inline-preview": preview, 'textarea[data-role="text"]': textarea } });
  const ctx = setup([{ id: "n1", type: "text", el }]);
  ctx.sync();
  assert.equal(el.classes.has("has-scroll-after"), true, "preview mode reads the preview scroller");
  el.classes.clear();
  el.classes.add("is-text-editing");
  ctx.sync();
  assert.equal(el.classes.has("has-scroll-after"), false, "editing mode reads the textarea scroller");
  assert.equal(el.classes.has("has-scroll-before"), true);
});

test("non-text nodes are skipped", () => {
  const el = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(0, 120, 500) } });
  const ctx = setup([{ id: "img1", type: "image", el }]);
  ctx.sync();
  assert.equal(el.classes.has("has-scroll-after"), false);
});

test("nodeId filter syncs only the requested node", () => {
  const el1 = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(0, 120, 500) } });
  const el2 = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(0, 120, 120) } });
  const ctx = setup([{ id: "n1", type: "text", el: el1 }, { id: "n2", type: "text", el: el2 }]);
  ctx.sync("n1");
  assert.equal(el1.classes.has("has-scroll-after"), true);
  assert.equal(el2.classes.has("has-scroll-after"), false);
});

test("sync covers every text node on each call (scroll events are browser-coalesced)", () => {
  const el1 = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(0, 120, 500) } });
  const el2 = makeNodeEl({ scrollers: { ".text-inline-preview": makeScroller(380, 120, 500) } });
  const ctx = setup([{ id: "n1", type: "text", el: el1 }, { id: "n2", type: "text", el: el2 }]);
  ctx.sync();
  assert.equal(el1.classes.has("has-scroll-after"), true);
  assert.equal(el2.classes.has("has-scroll-before"), true);
  assert.equal(el2.classes.has("has-scroll-after"), false);
});

test("fade layers never intercept pointer input and ship both themes", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /has-scroll-before \.node-body::before/);
  assert.match(css, /has-scroll-after \.node-body::after/);
  assert.match(css, /pointer-events: none/);
  // 渐隐层只用 --panel-solid 语义变量（主题感知，明暗自动适配；UI-SPEC 禁裸色值）
  assert.match(css, /has-scroll-before[\s\S]*var\(--panel-solid\)/);
  assert.doesNotMatch(css, /rgba\(255, 255, 255/);
});

test("scroll events sync only the scrolled node, not the whole canvas", () => {
  // 性能契约：滚动监听按节点过滤（大画布上每个滚动事件不做全量扫描）
  assert.match(source, /els\.nodes\.addEventListener\("scroll"[\s\S]*?syncTextNodeScrollEdges\(nodeEl\.dataset\.id\)/);
  assert.doesNotMatch(source, /addEventListener\("scroll"[\s\S]*?syncTextNodeScrollEdges\(\);/);
});
