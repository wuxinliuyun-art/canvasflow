const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
let transfer;
const image = "data:image/png;base64,aGVsbG8=";
beforeEach(() => {
  delete require.cache[require.resolve("../modules/browser-transfer-server")];
  transfer = require("../modules/browser-transfer-server");
});

test("requires a live canvas before accepting images", () => {
  assert.equal(transfer({ action: "probe" }).ready, false);
  assert.throws(() => transfer({ action: "send", image }), /打开/);
  transfer({ action: "poll", receiver: "canvas-a", focused: true });
  assert.equal(transfer({ action: "probe" }).ready, true);
});

test("pins deliveries to their receiver and retries until acknowledged", () => {
  transfer({ action: "poll", receiver: "canvas-a", focused: true });
  const { id } = transfer({ action: "send", image });
  assert.equal(transfer({ action: "poll", receiver: "canvas-b", focused: true }).items.length, 0);
  transfer({ action: "ack", receiver: "canvas-b", id });
  assert.equal(transfer({ action: "poll", receiver: "canvas-a", focused: true }).items[0].id, id);
  assert.equal(transfer({ action: "poll", receiver: "canvas-a" }).items.length, 1);
  transfer({ action: "ack", receiver: "canvas-a", id });
  assert.equal(transfer({ action: "poll", receiver: "canvas-a" }).items.length, 0);
});

test("rejects URLs, unsupported formats and oversized images", () => {
  transfer({ action: "poll", receiver: "canvas-a" });
  for (const invalid of ["https://example.com/x.png", "data:image/svg+xml;base64,AAAA", "data:image/png;base64," + "A".repeat(14000000)]) {
    assert.throws(() => transfer({ action: "send", image: invalid }), /格式/);
  }
});

test("accepts selected text and preserves a safe source URL", () => {
  transfer({ action: "poll", receiver: "canvas-a", focused: true });
  transfer({ action: "send", kind: "text", text: "网页选中文字", sourceUrl: "https://example.com/article" });
  const [item] = transfer({ action: "poll", receiver: "canvas-a" }).items;
  assert.equal(item.kind, "text");
  assert.equal(item.text, "网页选中文字");
  assert.equal(item.sourceUrl, "https://example.com/article");
  assert.equal(item.image, undefined);
});

test("drops unsafe source URLs", () => {
  transfer({ action: "poll", receiver: "canvas-a", focused: true });
  transfer({ action: "send", image, sourceUrl: "javascript:alert(1)" });
  assert.equal(transfer({ action: "poll", receiver: "canvas-a" }).items[0].sourceUrl, "");
});

test("bounds the queue and expires unattended deliveries", () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    transfer({ action: "poll", receiver: "canvas-a" });
    for (let i = 0; i < 8; i++) transfer({ action: "send", image });
    assert.throws(() => transfer({ action: "send", image }), /过多/);
    now += 120001;
    assert.equal(transfer({ action: "probe" }).ready, false);
    now += 600000;
    assert.equal(transfer({ action: "poll", receiver: "canvas-a" }).items.length, 0);
  } finally { Date.now = originalNow; }
});
