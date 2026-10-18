const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function fixture(overrides = {}) {
  const context = { window: {}, console, state: { settings: { apiKey: 'test-key' } }, desktop: null,
    activeApiType: () => 'apimart', normalizeAiNodeSettings: () => {},
    image25ExtVersion: () => null, isImage25StandardModel: () => false,
    materializeReferenceImage: async image => image.image || image, escapeHtml: String,
    ...overrides };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../model-catalog.js'), 'utf8'), context);
  context.modelCatalogEntry = id => context.window.CANVASFLOW_MODEL_CATALOG.apimart.models.find(m => m.id === id);
  vm.runInContext(app.slice(app.indexOf('async function submitGeneration('), app.indexOf('async function fetchImageAsBase64(')), context);
  vm.runInContext(app.slice(app.indexOf('function imageModelPricingHtml('), app.indexOf('function aiNodeControls(')), context);
  return context;
}
test('MJ uses independent submit route, documented fields, reference data and APIMart key', async () => {
  let request;
  const c = fixture({ apiFetch: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ data: [{ task_id: 'task_mj' }] }) }; } });
  assert.equal(await c.submitGeneration('product', [{ image: 'data:image/png;base64,AA==' }], { _model: 'midjourney', _mjSpeed: 'fast', _mjVersion: '7', _size: '16:9', _count: 4 }), 'task_mj');
  assert.equal(request.url, '/api/midjourney/generate');
  assert.deepEqual(request.body, { prompt: 'product', size: '16:9', version: '7', speed: 'fast', image_urls: ['data:image/png;base64,AA=='], _apiKey: 'test-key' });
});
test('MJ defaults, desktop key isolation and regular image route remain correct', async () => {
  let request;
  const c = fixture({ desktop: {}, apiFetch: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ data: { id: 'task_1' } }) }; } });
  await c.submitGeneration('cat', [], { _model: 'midjourney', _size: '1:1' });
  assert.equal(request.body.version, '8.2'); assert.equal(request.body.speed, 'relax');
  assert(!('_apiKey' in request.body));
  await c.submitGeneration('cat', [], { _model: 'gpt-image-2', _resolution: '1k', _size: '1:1' });
  assert.equal(request.url, '/api/generate'); assert.equal(request.body.model, 'gpt-image-2'); assert(!('quality' in request.body));
});
test('unified task results preserve all images and report upstream errors', async () => {
  const c = fixture({ apiFetch: async () => ({ ok: true, json: async () => ({ data: { status: 'completed', result: { images: [{ url: ['a', 'b'] }, { url: 'c' }] } } }) }) });
  assert.deepEqual(Array.from(await c.pollTask('task_mj', null, true)), ['a', 'b', 'c']);
  c.apiFetch = async () => ({ ok: false, status: 402, json: async () => ({ error: { message: '余额不足' } }) });
  await assert.rejects(c.submitGeneration('cat', [], { _model: 'midjourney' }), /余额不足/);
});
test('official GPT Image 2 keeps its own model ID, quality and token pricing', async () => {
  let payload;
  const c = fixture({ apiFetch: async (url, options) => { assert.equal(url, '/api/generate'); payload = JSON.parse(options.body); return { ok: true, json: async () => ({ data: { id: 'official-task' } }) }; } });
  for (const quality of ['auto', 'low', 'medium', 'high']) {
    await c.submitGeneration('cat', [], { _model: 'gpt-image-2-official', _quality: quality, _resolution: '2k', _size: '16:9' });
    assert.equal(payload.model, 'gpt-image-2-official'); assert.equal(payload.quality, quality); assert.equal(payload.resolution, '2k');
  }
  const html = c.imageModelPricingHtml(c.modelCatalogEntry('gpt-image-2-official'), {});
  assert(html.includes('查看模型广场价格')); assert(!html.includes('0.085')); assert.equal(c.modelCatalogEntry('gpt-image-2').quality, false);
});
test('Node proxy selects MJ endpoint and strips client key from upstream body', async () => {
  const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  const route = source.slice(source.indexOf('  if (["/api/generate", "/api/midjourney/generate"]'), source.indexOf('  // UXP connection probes'));
  const run = new Function('return async function(pathname, req, res, readBody, secretProvider, tryProxyRequest) {' + route + '}')();
  for (const [path, expected] of [['/api/generate', '/v1/images/generations'], ['/api/midjourney/generate', '/v1/midjourney/generations']]) {
    let seen;
    await run(path, { method: 'POST' }, { writeHead() {}, end() {} }, async () => Buffer.from(JSON.stringify({ prompt: 'cat', _apiKey: 'test-key' })), () => '', async (...args) => { seen = args; return { status: 200, body: '{}' }; });
    assert.equal(seen[1], expected); assert.equal(seen[2].Authorization, 'Bearer test-key'); assert(!JSON.parse(seen[3])._apiKey);
  }
});

test('price links follow APIMart model and never leak to AGToken', () => {
  const c = fixture();
  for (const entry of c.window.CANVASFLOW_MODEL_CATALOG.apimart.models.filter(m => !m.hidden)) {
    const html = c.imageModelPricingHtml(entry, {});
    assert(html.includes(entry.pricingUrl)); assert(html.includes('查看模型广场价格'));
    assert(!html.includes('Credits')); assert(!html.includes('参考价'));
    const agtokenHtml = c.imageModelPricingHtml(entry, {}, 'agtoken');
    assert(agtokenHtml.includes('https://agtoken.vip/pricing'));
    assert(!agtokenHtml.includes('apib.ai')); assert(!agtokenHtml.includes('APIMart'));
  }
  assert(c.imageModelPricingHtml(c.modelCatalogEntry('gpt-image-2-official'), {}).includes('/model/gpt-image-2'));
  assert(c.imageModelPricingHtml(c.modelCatalogEntry('midjourney'), {}).includes('/model/midjourney'));
});
