const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(require.resolve(path), 'utf8');
const region = read('../modules/region-hue.js');

test('opening the color brush initializes an empty brush even with a pen selection', () => {
  const calls = [];
  const context = {
    document: { createElement: () => ({ getContext: () => new Proxy({}, { get: (_, name) => () => calls.push(name) }) }) },
    preview: { width: 8, height: 8 }, overlay: { getContext: () => ({}) },
    penSelection: { clip: {} }, original: { width: 16, height: 16 },
    els: { lightboxPaintColor: { value: '#00ff00' } },
  };
  const start = region.indexOf('    const brush = document.createElement("canvas");');
  const end = region.indexOf('    const field =', start);
  vm.runInNewContext(region.slice(start, end), context);
  assert.deepEqual(calls, [], 'selection must not prefill brush pixels');
});

test('the color session yields pointer events to the pen and resumes exclusive brush handling afterward', () => {
  let listener, handled = 0, stopped = 0;
  const context = {
    eventCanvas: { addEventListener: (_type, fn) => { listener = fn; } },
    sessionEvents: { signal: {} }, lightboxPaintMode: 'pen', handler: () => handled++,
  };
  const start = region.indexOf('    const onCanvas =');
  const end = region.indexOf('    const ratio =', start);
  vm.runInNewContext(`${region.slice(start, end)}\nonCanvas('pointerdown', handler);`, context);
  listener({ stopImmediatePropagation: () => stopped++ });
  assert.equal(handled, 0); assert.equal(stopped, 0);
  for (const mode of ['brush', 'arrow', 'rect', 'eraser', 'crop', 'transform', 'fill', 'pick-color']) {
    context.lightboxPaintMode = mode;
    listener({ stopImmediatePropagation: () => stopped++ });
    assert.equal(handled, 0); assert.equal(stopped, 0);
  }
  context.lightboxPaintMode = 'idle';
  listener({ stopImmediatePropagation: () => stopped++ });
  assert.equal(handled, 1); assert.equal(stopped, 1);
});

test('changing the pen selection during a brush session updates its allowed coverage without adding painted pixels', () => {
  const coverage = [];
  const context = {
    lightboxSelection: { mask: Uint8Array.from([1, 0, 1, 0]) },
    snapshot: () => ({ data: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0]) }),
    manualBase: true, pointer: null, preview: { width: 2, height: 2 }, original: { width: 2, height: 2 }, source: { data: [] },
    field: () => ({ value: 'brush' }), baseColor: null, selection: null, materialBlur: null, schedule() {},
    materialSelection: (_source, mask) => { coverage.push([...mask]); return { mask }; },
  };
  const start = region.indexOf('    function identifySelection()');
  const end = region.indexOf('    function showBaseColor()', start);
  vm.runInNewContext(region.slice(start, end), context);
  context.identifySelection();
  assert.deepEqual(coverage[0], [0, 0, 255, 0]);
  context.lightboxSelection = { mask: Uint8Array.from([1, 1, 0, 0]) };
  context.identifySelection();
  assert.deepEqual(coverage[1], [0, 255, 0, 0]);
});

test('pen controls share the original toolbar and stay visible in color sessions, with the right panel centered', () => {
  const html = read('../index.html'), css = read('../styles.css');
  const dock = html.indexOf('<section class="lightbox-selection-options"');
  assert.ok(dock > html.indexOf('id="lightboxPaintToolbar"'));
  assert.ok(dock < html.indexOf('id="lightboxPaintConfirm"'));
  assert.doesNotMatch(css, /\.lightbox-selection-options \{[^}]*position: fixed/);
  assert.match(css, /\.lightbox\.is-editing \.lightbox-paint-toolbar \{[^}]*bottom: 24px;/);
  assert.doesNotMatch(css, /\.is-color-editing \.lightbox-paint-toolbar > :not/);
  assert.doesNotMatch(html, /lightbox-selection-help/);
  assert.doesNotMatch(region, /hiddenControls/);
  assert.doesNotMatch(region, /const hiddenControls = \[els\.lightboxPaintToolbar/);
  assert.match(css, /\.region-hue-inline \{[^}]*top: 50%; transform: translateY\(-50%\);/);
});
