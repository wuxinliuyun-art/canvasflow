const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const start = source.indexOf('function nodeViewportRevealOffset(');
const end = source.indexOf('function revealCreatedNode(');
assert.ok(start >= 0, 'nodeViewportRevealOffset should exist in app.js');
assert.ok(end > start, 'revealCreatedNode should follow nodeViewportRevealOffset in app.js');
const context = {};
vm.runInNewContext(source.slice(start, end), context);
const offset = (node, view = {x: 0, y: 0, scale: 1}, rect = {width: 900, height: 600}, padding) => context.nodeViewportRevealOffset(node, view, rect, padding);

test('visible new nodes do not move the canvas', () => {
  const delta = offset({x: 100, y: 100, w: 280, h: 300});
  assert.equal(delta.x, 0); assert.equal(delta.y, 0);
});

test('nodes closer than the padding are nudged to the padding edge', () => {
  const delta = offset({x: 20, y: 20, w: 100, h: 100});
  assert.equal(delta.x, 4); assert.equal(delta.y, 4); // 24 - 20
});

test('collision placement above viewport reveals the complete node with minimum pan', () => {
  const node = {x: 460, y: -360, w: 280, h: 300};
  const delta = offset(node);
  assert.equal(delta.x, 0); assert.equal(delta.y, 384);
  const after = offset(node, {x: delta.x, y: delta.y, scale: 1});
  assert.equal(after.x, 0); assert.equal(after.y, 0);
});

test('reveal respects zoom and pan without changing node coordinates or scale', () => {
  const node = {x: 400, y: 300, w: 280, h: 220};
  const view = {x: 50, y: -30, scale: 1.5};
  const delta = offset(node, view);
  assert.equal(delta.x, -194); assert.equal(delta.y, -174);
  assert.equal(node.x, 400); assert.equal(view.scale, 1.5);
});

test('oversized nodes expose top controls rather than centering outside the viewport', () => {
  const delta = offset({x: -400, y: -500, w: 800, h: 1000}, {x: 0, y: 0, scale: 2}, {width: 500, height: 400});
  assert.equal(delta.x, 824); assert.equal(delta.y, 1024);
});

test('partially visible nodes pan by the overflowing amount only', () => {
  // Node pokes 60px past the right edge and 40px past the bottom edge.
  const node = {x: 680, y: 420, w: 280, h: 220};
  const delta = offset(node);
  assert.equal(delta.x, -84); // 680 + 280 = 960 > 900 - 24, pan = 876 - 960
  assert.equal(delta.y, -64); // 420 + 220 = 640 > 600 - 24, pan = 576 - 640
});

test('custom padding widens the reveal band symmetrically', () => {
  const node = {x: 0, y: 0, w: 100, h: 100};
  // Cross-realm objects fail deepStrictEqual, so compare fields individually.
  const delta = offset(node, {x: 0, y: 0, scale: 1}, {width: 900, height: 600}, 40);
  assert.equal(delta.x, 40); assert.equal(delta.y, 40);
});

test('repeated offset application converges instead of scrolling forever', () => {
  const node = {x: 1200, y: 900, w: 280, h: 220};
  let view = {x: -200, y: -300, scale: 1};
  const rect = {width: 900, height: 600};
  let previous = null;
  for (let i = 0; i < 10; i++) {
    const delta = offset(node, view, rect);
    if (!delta.x && !delta.y) break;
    assert.deepEqual(delta, previous === null ? delta : previous, 'offset must be stable between iterations');
    previous = delta;
    view = {x: view.x + delta.x, y: view.y + delta.y, scale: view.scale};
  }
  const settled = offset(node, view, rect);
  assert.equal(settled.x, 0);
  assert.equal(settled.y, 0);
});

test('zoomed-out view of an oversized node still aligns it to the padding edge', () => {
  const node = {x: -400, y: -400, w: 2000, h: 2000};
  const delta = offset(node, {x: 0, y: 0, scale: 0.5}, {width: 800, height: 600});
  assert.equal(delta.x, 224); // 24 - (-400 * 0.5)
  assert.equal(delta.y, 224);
});
