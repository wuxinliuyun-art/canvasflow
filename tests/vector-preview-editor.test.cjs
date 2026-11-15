const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('const vectorizePreparedImages = new Map();');
const end = source.indexOf('async function runBuiltinVectorize', start);

function harness({ width = 800, height = 600, fail = false } = {}) {
  let calls = 0;
  const context = {
    loadHtmlImage: async () => ({ naturalWidth: width, naturalHeight: height }),
    prepareLightboxLineArtSource: async () => {
      calls++;
      if (fail) throw Error('upscaler unavailable');
      return { width: 2048, height: 1536, source: { toDataURL: () => 'data:image/png;base64,PREPARED' } };
    }
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.prepare = prepareVectorizeImage; this.cache = vectorizePreparedImages;`, context);
  return { ...context, calls: () => calls };
}

test('preview and export share pending and completed upscale results independent of vector parameters', async () => {
  const env = harness();
  const [first, second] = await Promise.all([env.prepare('data:image/png;base64,SOURCE'), env.prepare('data:image/png;base64,SOURCE')]);
  assert.equal(first, second);
  assert.equal(first.data, 'PREPARED');
  assert.equal(env.calls(), 1);
  assert.equal(await env.prepare('data:image/png;base64,SOURCE'), first);
  assert.equal(env.calls(), 1);
});

test('2K images skip super resolution and preserve their original MIME and bytes', async () => {
  const env = harness({ width: 2048, height: 1024 });
  const result = await env.prepare('data:image/jpeg;base64,JPEG');
  assert.equal(env.calls(), 0);
  assert.equal(result.mime, 'image/jpeg');
  assert.equal(result.data, 'JPEG');
});

test('failed upscale results are not cached and memory cache is bounded', async () => {
  const failing = harness({ fail: true });
  await assert.rejects(failing.prepare('data:image/png;base64,SOURCE'), /upscaler unavailable/);
  assert.equal(failing.cache.size, 0);
  const env = harness();
  for (let index = 0; index < 6; index++) await env.prepare(`data:image/png;base64,SOURCE${index}`);
  assert.equal(env.cache.size, 3);
});

test('both vector paths use the same preprocessor and double click opens the editor', () => {
  const runner = source.slice(source.indexOf('async function runBuiltinVectorize'), source.indexOf('const VECTOR_PREVIEW_MAX_EDGE'));
  const preview = source.slice(source.indexOf('async function updateVectorPreview'), source.indexOf('let vectorPreviewEditor'));
  assert.match(runner, /await prepareVectorizeImage/);
  assert.match(preview, /await prepareVectorizeImage/);
  assert.match(source, /els\.nodes\.addEventListener\("dblclick", async ev => \{\s*const vectorPreview/);
  assert.match(source, /openVectorPreviewEditor\(nodeElement\.dataset\.id\)/);
});

test('parameter editor reuses node controls, synchronizes values, exports and cleans up', () => {
  const editor = source.slice(source.indexOf('function openVectorPreviewEditor'), source.indexOf('function notifyVectorizeInputsChanged'));
  assert.match(editor, /template\.innerHTML = toolNodeBody\(node\)/);
  assert.match(editor, /current\.toolValues\[input\.dataset\.key\]/);
  assert.match(editor, /updateVectorPreview\(nodeId\)/);
  assert.match(editor, /await runToolNode\(nodeId\)/);
  assert.match(editor, /state\.activePageId !== pageId/);
  assert.match(editor, /observer\.disconnect\(\)/);
  assert.match(editor, /input\.disabled = !!current\.toolRunning/);
});
