const test = require('node:test');
const assert = require('node:assert/strict');
const { materialSelection, paintMaterial, adjustMaterial, brushOverlayAlpha } = require('../modules/region-hue.js');

test('base mode uses brush AND color, brush mode deliberately includes all painted nontransparent pixels', () => {
  const source = new Uint8ClampedArray([255,0,0,255, 0,0,255,255, 255,0,0,255, 255,0,0,0]);
  const coverage = new Uint8ClampedArray([255,255,0,255]);
  const filtered = materialSelection(source, coverage, 'base', 25, [255,0,0]);
  const direct = materialSelection(source, coverage, 'brush', 25, null);
  assert.deepEqual([...filtered.mask], [255,0,0,0]);
  assert.deepEqual([...direct.mask], [255,255,0,0]);
  for (const selection of [filtered,direct]) {
    const hue = adjustMaterial(source, selection.mask, 4, 1, { hue: 120 });
    const paint = paintMaterial(source, selection.mask, '#00FF00');
    assert.deepEqual(paint.slice(8), source.slice(8));
    assert.deepEqual(hue.slice(8), source.slice(8));
    assert.deepEqual([...paint.slice(0,3)], [0,42,0]);
  }
  assert.deepEqual([...paintMaterial(source, filtered.mask, '#00FF00').slice(4,8)], [0,0,255,255]);
  assert.deepEqual([...paintMaterial(source, direct.mask, '#00FF00').slice(4,8)], [0,3,0,255]);
});

test('same-color unrelated parts can match, but source alpha and outside coverage never do', () => {
  const source = new Uint8ClampedArray([200,0,0,255, 210,0,0,128, 220,0,0,0]);
  const selection = materialSelection(source, new Uint8ClampedArray([255,255,255]), 'base', 25, [200,0,0]);
  assert.equal(selection.count, 2);
  const result = paintMaterial(source, selection.mask, '#00FF00');
  assert.equal(result[3], 255); assert.equal(result[7], 128); assert.equal(result[11], 0);
  assert.deepEqual(result.slice(8), source.slice(8));
});

test('range overlay never paints gray or color into transparent pixels', () => {
  assert.equal(brushOverlayAlpha(255,0), 0);
  assert.equal(brushOverlayAlpha(0,255), 0);
  assert.equal(brushOverlayAlpha(255,255), 115);
  assert.ok(brushOverlayAlpha(255,128) < brushOverlayAlpha(255,255));
});

test('paint opacity and feathering blend once without altering the original alpha', () => {
  const source = new Uint8ClampedArray([128,128,128,120]);
  const result = paintMaterial(source, new Uint8ClampedArray([128]), '#FF0000', 50);
  assert.deepEqual([...result], [127,96,96,120]);
  assert.deepEqual([...source], [128,128,128,120]);
});

test('full resolution color filtering does not inherit neighboring preview colors', () => {
  const source = new Uint8ClampedArray([255,0,0,255, 0,255,0,255]);
  const mask = materialSelection(source, new Uint8ClampedArray([255,255]), 'base', 10, [255,0,0]).mask;
  assert.deepEqual([...mask], [255,0]);
});

test('both toolbar entries open one tool and export checks original-size colors', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const script = fs.readFileSync(path.join(__dirname, '../modules/region-hue.js'), 'utf8');
  assert.match(script, /data-field="range-mode"/);
  assert.match(script, /data-field="edit-mode"/);
  assert.match(script, /lightboxColorBrush"\)\.onclick = \(\) => openRegionHue\("paint"\)/);
  assert.match(script, /const fullSelection = materialSelection\(full\.data, fullMask/);
  assert.doesNotMatch(script, /roughness|粗糙度/);
});

test('integrated brush matches the original free-color brush shading at full strength', () => {
  const { writeSketchFillPixel } = require('../modules/fill-selection.js');
  const source = new Uint8ClampedArray([0,0,0,255, 64,64,64,255, 128,128,128,128, 255,255,255,255]);
  const result = paintMaterial(source, new Uint8ClampedArray(4).fill(255), '#C86432');
  const expected = source.slice();
  for (let offset = 0; offset < source.length; offset += 4) writeSketchFillPixel(expected, source, offset, [200,100,50], true);
  assert.deepEqual(result, expected);
  assert.deepEqual([...result.slice(0,3)], [0,0,0]);
  assert.deepEqual([...result.slice(12,15)], [200,100,50]);
  assert.ok(result[4] < result[8] && result[8] < result[12]);
});

test('paintMaterial 携带笔刷像素时按每笔落下时的颜色上色，改色不影响已涂区域', () => {
  const source = new Uint8ClampedArray([255,255,255,255, 255,255,255,255, 255,255,255,255, 255,255,255,255]);
  const mask = new Uint8ClampedArray(4).fill(255);
  // 两笔不同颜色（红/蓝），笔刷像素按 RGBA 携带颜色
  const brushPixels = new Uint8ClampedArray([255,0,0,255, 255,0,0,255, 0,0,255,255, 0,0,255,255]);
  const result = paintMaterial(source, mask, '#00FF00', 100, brushPixels);
  assert.deepEqual([...result.slice(0,3)], [255,0,0], '前两像素应为笔刷里的红色而非当前色');
  assert.deepEqual([...result.slice(4,7)], [255,0,0]);
  assert.deepEqual([...result.slice(8,11)], [0,0,255], '后两像素应为笔刷里的蓝色');
  // 笔刷像素透明（alpha=0）时回退到统一 hex 色
  const fallback = paintMaterial(source, mask, '#00FF00', 100, new Uint8ClampedArray(16));
  assert.deepEqual([...fallback.slice(0,3)], [0,255,0]);
  // 不传笔刷像素保持旧行为（整片统一色），老调用方不受影响
  const legacy = paintMaterial(source, mask, '#00FF00');
  assert.deepEqual([...legacy.slice(0,3)], [0,255,0]);
});
