const test = require('node:test');
const assert = require('node:assert/strict');
const { adjustMaterial, blurMaterialPixels, recolor } = require('../modules/region-hue.js');
const pixels = values => new Uint8ClampedArray(values.flatMap(value => [value,value,value,255]));

test('zero adjustments exactly restore the original and hue-only behavior remains compatible', () => {
  const source = new Uint8ClampedArray([120,40,20,180, 70,100,150,255]);
  const mask = new Uint8ClampedArray([255,128]);
  assert.deepEqual(adjustMaterial(source, mask, 2, 1), source);
  assert.deepEqual(adjustMaterial(source, mask, 2, 1, { hue: 90 }), recolor(source, mask, 90));
});

test('brightness raises and lowers midtones while retaining local texture contrast', () => {
  const source = pixels(Array.from({ length: 81 }, (_, index) => index % 2 ? 130 : 110));
  const mask = new Uint8ClampedArray(81).fill(255);
  const brighter = adjustMaterial(source, mask, 9, 9, { brightness: 65 });
  const darker = adjustMaterial(source, mask, 9, 9, { brightness: -65 });
  assert.ok(brighter[40 * 4] > source[40 * 4]);
  assert.ok(darker[40 * 4] < source[40 * 4]);
  const originalContrast = source[41 * 4] - source[40 * 4];
  const darkContrast = darker[41 * 4] - darker[40 * 4];
  assert.ok(darkContrast >= originalContrast * .85, 'darkening should not multiply away the texture contrast');
});

test('brightness preserves ordering of shadows, midtones and highlights', () => {
  const source = pixels([10,60,128,200,245]);
  const mask = new Uint8ClampedArray(5).fill(255);
  for (const brightness of [-100,100]) {
    const result = adjustMaterial(source, mask, 5, 1, { brightness });
    for (let index = 1; index < 5; index++) assert.ok(result[index * 4] > result[(index - 1) * 4]);
  }
});


test('Gaussian blur excludes outside and transparent colors at the material boundary', () => {
  const source = pixels([255,100,100,100,0]);
  const mask = new Uint8ClampedArray([0,255,255,255,0]);
  const blurred = blurMaterialPixels(source, mask, 5, 1);
  for (const index of [1,2,3]) for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(blurred[index * 3 + channel] - 100) < .001);
  source[3] = 0; mask[0] = 255;
  assert.ok(Math.abs(blurMaterialPixels(source, mask, 5, 1)[3] - 100) < .001);
});


test('combined adjustments preserve unselected pixels, alpha and source buffers', () => {
  const source = new Uint8ClampedArray([100,80,60,120, 220,80,10,255, 80,90,100,0]);
  const saved = source.slice();
  const result = adjustMaterial(source, new Uint8ClampedArray([255,0,255]), 3, 1, { hue: 30, brightness: 50 });
  assert.deepEqual(result.slice(4), source.slice(4));
  assert.equal(result[3], 120);
  assert.deepEqual(source, saved);
  assert.notDeepEqual(result.slice(0,3), source.slice(0,3));
});

test('feathering blends the adjustment once and cached blur matches uncached output', () => {
  const source = pixels([128,128,128]);
  const mask = new Uint8ClampedArray([255,128,0]);
  const options = { brightness: 50 };
  const blurred = blurMaterialPixels(source, mask, 3, 1);
  const result = adjustMaterial(source, mask, 3, 1, options, blurred);
  assert.deepEqual(result, adjustMaterial(source, mask, 3, 1, options));
  assert.ok(result[0] > result[4] && result[4] > result[8]);
  assert.equal(result[8], source[8]);
});

test('UI supports brightness-only application, reset and shared export processing without roughness', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const script = fs.readFileSync(path.join(__dirname, '../modules/region-hue.js'), 'utf8');
  assert.match(script, /adjustmentNames = \["hue", "brightness"\]/);
  assert.doesNotMatch(script, /roughness|noiseSeed|粗糙度/);
  assert.match(script, /!hasAdjustments\(\)/);
  assert.match(script, /for \(const name of adjustmentNames\) field\(name\)\.value = 0/);
  assert.match(script, /renderPixels\(full\.data, fullSelection\.mask/);
  assert.match(script, /materialBlur = null/);
});
