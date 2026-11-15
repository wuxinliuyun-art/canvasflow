const test = require('node:test');
const assert = require('node:assert/strict');
const { identify, recolor, dominantBaseColor } = require('../modules/region-hue.js');

test('selection stays inside brush and excludes grayscale and transparency', () => {
  const source = new Uint8ClampedArray([255,0,0,255, 255,0,0,255, 128,128,128,255, 255,0,0,0]);
  const brush = new Uint8ClampedArray([0,0,0,255, 0,0,0,0, 0,0,0,255, 0,0,0,255]);
  const result = identify(source, brush, 25);
  assert.equal(result.count, 1);
  assert.deepEqual([...result.mask], [255,0,0,0]);
});

test('circular red hue selection includes both sides of zero', () => {
  const source = new Uint8ClampedArray([255,0,8,255, 255,8,0,255, 0,0,255,255]);
  const result = identify(source, new Uint8ClampedArray(12).fill(255), 25);
  assert.equal(result.count, 2);
  assert.equal(result.mask[2], 0);
});

test('hue rotation preserves alpha, shading and unselected pixels', () => {
  const source = new Uint8ClampedArray([255,0,0,128, 128,0,0,255, 10,20,30,255]);
  const mask = new Uint8ClampedArray([255,255,0]);
  assert.deepEqual([...recolor(source, mask, 120)], [0,255,0,128, 0,128,0,255, 10,20,30,255]);
  assert.deepEqual(recolor(source, mask, 0), source);
  assert.deepEqual([...source], [255,0,0,128, 128,0,0,255, 10,20,30,255]);
});

test('empty and grayscale inputs do not produce a selection', () => {
  assert.equal(identify(new Uint8ClampedArray([80,80,80,255]), new Uint8ClampedArray(4).fill(255), 90).count, 0);
});

test('explicit base color wins over the dominant painted color', () => {
  const source = new Uint8ClampedArray([255,0,0,255, 255,0,0,255, 0,0,255,255]);
  const brush = new Uint8ClampedArray(source.length).fill(255);
  assert.deepEqual([...identify(source, brush, 25, [0,0,255]).mask], [0,0,255]);
  assert.equal(identify(source, brush, 25, [128,128,128]).count, 0);
});

test('explicit base changes do not change painted scope', () => {
  const source = new Uint8ClampedArray([255,0,0,255, 0,0,255,255]);
  const brush = new Uint8ClampedArray([0,0,0,255, 0,0,0,0]);
  assert.equal(identify(source, brush, 25, [0,0,255]).count, 0);
  assert.equal(identify(source, brush, 25, [255,0,0]).count, 1);
});

test('white and black bases match nearby neutral shades, not each other or saturated colors', () => {
  const source = new Uint8ClampedArray([255,255,255,255, 230,230,230,255, 0,0,0,255, 20,20,20,255, 255,0,0,255]);
  const brush = new Uint8ClampedArray(source.length).fill(255);
  assert.deepEqual([...identify(source, brush, 25, [255,255,255]).mask], [255,255,0,0,0]);
  assert.deepEqual([...identify(source, brush, 25, [0,0,0]).mask], [0,0,255,255,0]);
});

test('pure white, black and gray receive tint while preserving alpha and shading order', () => {
  const source = new Uint8ClampedArray([0,0,0,128, 128,128,128,255, 255,255,255,255]);
  const mask = new Uint8ClampedArray([255,255,255]);
  const result = recolor(source, mask, 120);
  for (let offset = 0; offset < source.length; offset += 4) {
    assert.ok(result[offset + 1] > result[offset]);
    assert.ok(result[offset + 1] > result[offset + 2]);
    assert.equal(result[offset + 3], source[offset + 3]);
  }
  assert.ok(result[1] < result[5] && result[5] < result[9]);
  assert.deepEqual(recolor(source, mask, 0), source);
});

test('image picker avoids native popup and adjustment sliders hide the painted overlay', () => {
  const script = require('node:fs').readFileSync(require('node:path').join(__dirname, '../modules/region-hue.js'), 'utf8');
  assert.match(script, /data-field="base" type="text"/);
  assert.doesNotMatch(script, /data-field="base" type="color"/);
  assert.match(script, /adjustmentNames, "paint-color", "paint-opacity"[\s\S]*?field\("painted"\)\.checked = false;/);
  assert.doesNotMatch(script, /data-field="overlay"|field\("overlay"\)/);
});

test('automatic base chooses largest color area including neutral colors', () => {
  const painted = new Uint8ClampedArray(12).fill(255);
  assert.deepEqual(dominantBaseColor(new Uint8ClampedArray([255,0,0,255, 250,0,0,255, 0,0,255,255]), painted), [253,0,0]);
  assert.deepEqual(dominantBaseColor(new Uint8ClampedArray([255,255,255,255, 250,250,250,255, 0,0,255,255]), painted), [253,253,253]);
  assert.equal(dominantBaseColor(new Uint8ClampedArray(12), painted), null);
});

test('automatic base respects brush coverage and source transparency', () => {
  const source = new Uint8ClampedArray([255,0,0,255, 0,0,255,255, 0,255,0,0]);
  const painted = new Uint8ClampedArray([0,0,0,40, 0,0,0,255, 0,0,0,255]);
  assert.deepEqual(dominantBaseColor(source, painted), [0,0,255]);
  assert.equal(dominantBaseColor(source, new Uint8ClampedArray(12)), null);
});

test('manual base is protected and inline editor shares the main image canvas', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const script = fs.readFileSync(path.join(__dirname, '../modules/region-hue.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
  assert.match(script, /if \(!manualBase && pointer === null\)/);
  assert.match(script, /manualBase = true/);
  assert.match(script, /sizeObserver\.observe\(eventCanvas\)/);
  assert.match(script, /sizeObserver\.disconnect\(\)/);
  assert.match(script, /document\.createElement\("section"\)/);
  assert.doesNotMatch(script, /showModal\(/);
  assert.match(script, /sessionEvents\.abort\(\)/);
  assert.match(script, /lightboxEditBase = exported/);
  assert.match(script, /lightboxEditBase = previousEdit\.base/);
  assert.doesNotMatch(script, /addNode\(/);
  assert.match(css, /\.region-hue-inline \.palette-mask-surface \{ display: none; \}/);
});

test('region selection shows a color swatch and brush / eraser buttons without selection history', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const script = fs.readFileSync(path.join(__dirname, '../modules/region-hue.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
  assert.match(script, /class="region-hue-base-swatch"/);
  assert.match(script, /setProperty\("--region-base-color", hex\)/);
  assert.match(script, /data-action="brush"[^>]*aria-label="笔刷添加选区"/);
  assert.match(script, /data-action="erase"[^>]*aria-label="橡皮擦除选区"/);
  assert.doesNotMatch(script, /data-action="(?:undo|redo)"|data-field="tool"|attachShadow|basecoat/i);
  assert.match(script, /brushTool === "erase" \? "destination-out" : "source-over"/);
  assert.match(css, /background: var\(--region-base-color, var\(--panel-2\)\)/);
});

test('palette sizing clears legacy transforms without double shrinking the panel', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const start = app.indexOf('function fitEditorPaletteScale() {');
  const end = app.indexOf('let lightboxPickReturnMode', start);
  const cleared = [];
  vm.runInNewContext(`${app.slice(start, end)}\nfitEditorPaletteScale();`, {
    $: id => { assert.equal(id, 'editorPalette'); return { style: { removeProperty: property => cleared.push(property) } }; }
  });
  assert.deepEqual(cleared, ['transform', 'height', 'overflow', 'transform-origin', 'flex-shrink']);
});

test('removed UI pilot is absent from dependencies and release inventories', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of ['package.json', 'package-lock.json', 'build-mac.ps1', 'build-web-update.ps1', 'desktop-dotnet/CanvasFlow.Desktop.csproj']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /basecoat/i);
  }
});


test('sketch fill has its own button and no legacy material mode entry remains', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(html, /id="lightboxPaintFill"[^>]*aria-label="草图上色"/);
  assert.doesNotMatch(html, /id="lightboxFillMode"|<option value="material">/);
  assert.doesNotMatch(app, /\$\("lightboxFillMode"\)/);
});

test('material color editing uses a named palette icon beside the other color tools', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../modules/region-hue.js'), 'utf8');
  assert.match(html, /id="lightboxRegionHue" class="lightbox-icon-btn"[^>]*title="材质颜色修改"[^>]*aria-label="材质颜色修改"><svg/);
  assert.match(script, /<h2>材质颜色修改<\/h2>/);
  assert.doesNotMatch(script, /区域色相/);
});

test('painted scope obeys its checkbox after recognition and material outlines are removed', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const script = fs.readFileSync(path.join(__dirname, '../modules/region-hue.js'), 'utf8');
  assert.match(script, /tint\.data\[offset \+ 3\] = field\("painted"\)\.checked \? brushOverlayAlpha\(painted\[offset \+ 3\], source\.data\[offset \+ 3\]\) : 0/);
  assert.doesNotMatch(script, /flashOutline|outlineVisible|selectionOutline|outlinePulse/);
  assert.match(script, /data-field="size"[^>]*value="72"/);
  assert.match(script, /brushRing\.remove\(\)/);
});

test('dashed brush size follows display scale and hides during picking', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const script = fs.readFileSync(path.join(__dirname, '../modules/region-hue.js'), 'utf8');
  const start = script.indexOf('    function syncBrushRing(');
  const end = script.indexOf('    const onCanvas', start);
  const hidden = new Set(['hidden']);
  const context = { brushPoint: null, picking: false, busy: false, lightboxPanSpaceDown: false, lightboxViewDrag: null, preview: { width: 1000 }, eventCanvas: { getBoundingClientRect: () => ({ width: 500 }) }, field: () => ({ value: 72 }), brushRing: { style: {}, classList: { add: value => hidden.add(value), remove: value => hidden.delete(value) } } };
  vm.runInNewContext(script.slice(start, end), context);
  context.syncBrushRing({ clientX: 300, clientY: 200 });
  assert.equal(context.brushRing.style.width, '36px');
  assert.equal(context.brushRing.style.height, '36px');
  assert.equal(hidden.has('hidden'), false);
  context.picking = true; context.syncBrushRing();
  assert.equal(hidden.has('hidden'), true);
});
