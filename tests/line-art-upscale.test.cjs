const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('async function prepareLightboxLineArtSource(');
const end = source.indexOf('document.getElementById("lightboxLineArtBtn")', start);

function harness(options = {}) {
  const calls = [];
  const response = options.response || { ok: true, status: 200, json: async () => ({ ok: true, images: [{ name: 'result.png', data: 'UPSCALED' }] }) };
  const send = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return response; };
  const context = {
    fetchToolExtensions: async () => { calls.push('list'); },
    enabledToolExtensions: () => options.missing ? [] : [{ id: 'upscale-white-point' }],
    desktop: options.browser ? null : { apiRequest: true }, apiFetch: send, fetch: send,
    extensionSettings: () => ({ serviceUrl: 'http://127.0.0.1:5199/' }),
    toolMimeFromName: () => 'image/png',
    document: { createElement: tag => {
      assert.equal(tag, 'canvas');
      return { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }), toDataURL: () => 'data:image/png;base64,ORIGINAL' };
    } },
    Image: class {
      constructor() { this.naturalWidth = options.outputWidth || 4000; this.naturalHeight = options.outputHeight || 2000; }
      async decode() { if (options.decodeError) throw Error('bad image'); }
    }
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.prepare = prepareLightboxLineArtSource;`, context);
  return { prepare: context.prepare, calls };
}

test('2K threshold is strictly the longest side and skips the extension at or above 2048', async () => {
  for (const [width, height] of [[2048,1024],[1024,2048],[3000,1000]]) {
    const env = harness(); const input = {};
    const result = await env.prepare(input, width, height);
    assert.equal(result.source, input);
    assert.equal(result.upscaled, false);
    assert.equal(env.calls.length, 0);
  }
});

test('low-resolution line art reuses desktop Real-ESRGAN and caps working resolution without distorting aspect', async () => {
  const env = harness();
  const result = await env.prepare({}, 1000,500);
  assert.equal(result.width, 2048); assert.equal(result.height, 1024); assert.equal(result.upscaled, true);
  const request = env.calls[1];
  assert.equal(request.url, '/api/extensions/upscale-white-point/run');
  assert.equal(request.body.images[0].data, 'ORIGINAL');
  assert.equal(request.body.params.model, '照片 x4');
  assert.equal(request.body.params.whitePoint, false);
});

test('browser mode uses the configured extension service instead of adding a new route', async () => {
  const env = harness({ browser: true });
  await env.prepare({}, 1000,500);
  assert.equal(env.calls[1].url, 'http://127.0.0.1:5199/api/extensions/upscale-white-point/run');
});

test('missing, failed and invalid upscalers are reported instead of silently extracting the original', async () => {
  await assert.rejects(harness({ missing: true }).prepare({},1000,500), /未找到可用/);
  await assert.rejects(harness({ response: { ok: false, status: 500, json: async () => ({ ok: false, error: 'GPU unavailable' }) } }).prepare({},1000,500), /GPU unavailable/);
  await assert.rejects(harness({ outputWidth: 1000, outputHeight: 500 }).prepare({},1000,500), /尺寸未增加/);
  await assert.rejects(harness({ decodeError: true }).prepare({},1000,500), /bad image/);
});

test('cancelled sessions do not start the GPU call after extension discovery', async () => {
  const env = harness();
  assert.equal(await env.prepare({},1000,500,() => false), null);
  assert.deepEqual(env.calls, ['list']);
});

test('line dialog ignores late results and applies the exact preview to the original geometry', () => {
  const dialogSource = source.slice(end, source.indexOf('function buildLightboxFillLayer', end));
  assert.match(dialogSource, /sequence !== requestSequence \|\| !sessionValid\(\)/);
  assert.match(dialogSource, /requestSequence\+\+/);
  assert.match(dialogSource, /lines\.width = width; lines\.height = height/);
  assert.match(dialogSource, /drawImage\(currentLines, 0, 0, width, height\)/);
  assert.doesNotMatch(dialogSource, /800 \/ Math\.max/);
  assert.match(dialogSource, /data-line-action="retry"/);
});
