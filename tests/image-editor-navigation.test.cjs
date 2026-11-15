const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('app.js');

function harness() {
  const windowEvents = {}, pointerEvents = {}, classes = new Set();
  let captured = null, updated = 0;
  const context = {
    lightboxPainting: true, lightboxPanSpaceDown: false, lightboxViewZoom: 3, lightboxViewOffset: { x: 100, y: 80 }, lightboxViewDrag: null,
    lightboxDrawing: false, lightboxTransformDrag: null, lightboxCropDrag: null,
    window: { addEventListener: (name, callback) => { windowEvents[name] = callback; } },
    Event: class {}, hideLightboxBrushRing: () => {}, updateLightboxPaintDisplaySize: () => { updated++; },
    els: {
      lightboxPaintCanvas: { dispatchEvent: () => {} },
      lightbox: {
        classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
        addEventListener: (name, callback, capture) => { assert.equal(capture, true); pointerEvents[name] = callback; },
        setPointerCapture: value => { captured = value; }, hasPointerCapture: value => captured === value, releasePointerCapture: () => { captured = null; }
      }
    }
  };
  const start = source.indexOf('function resetLightboxImageView()');
  const end = source.indexOf('// 左侧工具面板', start);
  vm.runInNewContext(source.slice(start, end), context);
  const event = extra => ({ button: 0, pointerId: 4, clientX: 10, clientY: 20, target: { closest: () => true }, preventDefault() {}, stopImmediatePropagation() {}, ...extra });
  return { context, windowEvents, pointerEvents, event, classes, updated: () => updated, captured: () => captured };
}

test('Space drag pans before paint handlers and releases capture cleanly', () => {
  const env = harness();
  env.windowEvents.keydown(env.event({ code: 'Space', target: { closest: () => false } }));
  assert.equal(env.context.lightboxPanSpaceDown, true);
  env.pointerEvents.pointerdown(env.event());
  assert.equal(env.captured(), 4);
  env.pointerEvents.pointermove(env.event({ clientX: 40, clientY: 70 }));
  assert.equal(env.context.lightboxViewOffset.x, 130);
  assert.equal(env.context.lightboxViewOffset.y, 130);
  env.pointerEvents.pointerup(env.event());
  assert.equal(env.context.lightboxViewDrag, null);
  assert.equal(env.captured(), null);
  env.windowEvents.keyup(env.event({ code: 'Space' }));
  assert.equal(env.context.lightboxPanSpaceDown, false);
});

test('middle drag remains available and normal painting or text entry does not pan', () => {
  const env = harness();
  env.pointerEvents.pointerdown(env.event());
  assert.equal(env.context.lightboxViewDrag, null);
  env.windowEvents.keydown(env.event({ code: 'Space', target: { closest: () => true } }));
  assert.equal(env.context.lightboxPanSpaceDown, false);
  env.pointerEvents.pointerdown(env.event({ button: 1 }));
  assert.ok(env.context.lightboxViewDrag);
  env.windowEvents.blur();
  assert.equal(env.context.lightboxViewDrag, null);
  assert.equal(env.classes.size, 0);
});

test('image reset restores zoom and position without changing pixels', () => {
  const env = harness();
  env.context.resetLightboxImageView();
  assert.equal(env.context.lightboxViewZoom, 1);
  assert.equal(env.context.lightboxViewOffset.x, 0);
  assert.equal(env.context.lightboxViewOffset.y, 0);
  assert.equal(env.updated(), 1);
});

test('right tools depend on viewport dimensions and never read image bounds', () => {
  const start = source.indexOf('function positionLightboxMirrorTools()');
  const end = source.indexOf('function syncLightboxBrushRing', start);
  const tools = { classList: { contains: () => false }, offsetWidth: 80, offsetHeight: 200, style: {} };
  const context = { lightboxPainting: true, els: { lightboxMirrorTools: tools }, requestAnimationFrame: callback => callback(), window: { innerWidth: 800, innerHeight: 600 } };
  vm.runInNewContext(`${source.slice(start, end)}\npositionLightboxMirrorTools();`, context);
  assert.equal(tools.style.left, '704px');
  assert.equal(tools.style.top, '300px');
});

test('color tool icons share geometry and stroke, with reset available in both editors', () => {
  const html = read('index.html'), css = read('styles.css');
  for (const id of ['lightboxRegionHue', 'lightboxPaintFill', 'lightboxColorBrush', 'lightboxColorPicker', 'lightboxPaintEraser']) assert.match(html, new RegExp(`id="${id}" class="lightbox-icon-btn"`));
  assert.match(css, /#lightboxPaletteTools \.lightbox-icon-btn svg \{[^}]*width: 18px; height: 18px;[^}]*stroke-width: 1\.8/);
  assert.match(html, /id="lightboxImageReset"/);
  assert.match(read('modules/region-hue.js'), /action\("view-reset"\)\.onclick = resetLightboxImageView/);
});
