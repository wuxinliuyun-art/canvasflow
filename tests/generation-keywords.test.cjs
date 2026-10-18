const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6l8AAAAASUVORK5CYII=';
function fixture() {
  const notices = [], created = [], stored = [];
  const c = { TextEncoder, TextDecoder, atob, btoa, console: { debug() {}, warn() {} },
    desktop: { storeImage: async image => { stored.push(image); return { id: 'asset-1' }; } },
    window: { canvasflowDesktop: { readAsset: async () => ({ dataUrl: stored[0] }) } },
    currentPage: () => ({ name: '项目' }), dataUrlToThumbnailDataUrl: async () => 'data:image/webp;base64,AA==',
    toast: text => notices.push(text), state: { edges: [] }, NODE_WIDTH: 240, uid: () => 'edge-1',
    addNode: () => { const node = { id: 'text-1' }; created.push(node); return node; },
    pushHistory() {}, render() {} };
  vm.createContext(c);
  vm.runInContext(app.slice(app.indexOf('const PNG_SIGNATURE ='), app.indexOf('// 勾选"以项目名称创建文件夹导出"')), c);
  vm.runInContext(app.slice(app.indexOf('async function externalizeImageField('), app.indexOf('async function migrateNodeAssets(')), c);
  vm.runInContext(app.slice(app.indexOf('async function resolveNodeImageDataUrl('), app.indexOf('els.viewport.addEventListener("contextmenu"')), c);
  return { c, notices, created, stored };
}

test('PNG with project information but no prompt still exposes extraction and explains missing data', async () => {
  const { c, notices, created } = fixture();
  const node = { type: 'image', image: c.embedGenerationMetadata(png, { 'CanvasFlow.Project': '项目', 'CanvasFlow.TaskId': 'q1' }) };
  const items = c.generationKeywordMenuItems(node);
  assert.equal(items.length, 1); assert.equal(items[0][0], '提取生成所用关键词');
  await items[0][1]();
  assert.equal(created.length, 0); assert.match(notices[0], /没有保存生成关键词/);
});

test('import captures original prompt before thumbnail replacement, even if later asset reads fail', async () => {
  const { c, created } = fixture();
  const original = c.embedGenerationMetadata(png, { prompt: '低多边形地形，绿色草地' });
  const node = { id: 'image-1', type: 'image', image: original, x: 0, y: 0 };
  await c.externalizeImageField(node, 'image', 'imageAssetId', 'test.png');
  assert.equal(node.image, 'data:image/webp;base64,AA==');
  c.window.canvasflowDesktop.readAsset = async () => { throw Error('missing asset'); };
  await c.generationKeywordMenuItems(node)[0][1]();
  assert.equal(created[0].text, '低多边形地形，绿色草地');
  assert.equal(c.state.edges[0].to.node, node.id);
});

test('existing imported nodes can read original asset metadata; empty nodes have no extraction entry', async () => {
  const { c, stored } = fixture();
  stored.push(c.embedGenerationMetadata(png, { prompt: '原图关键词' }));
  const oldNode = { type: 'image', image: 'data:image/webp;base64,AA==', imageAssetId: 'asset-1' };
  assert.equal(await c.readEmbeddedGenerationPrompt(oldNode), '原图关键词');
  assert.equal(oldNode.generationPrompt, '原图关键词');
  assert.equal(c.generationKeywordMenuItems({ type: 'ai-image', generationPrompt: '旧词' }).length, 0);
  assert.equal(c.generationKeywordMenuItems({ type: 'text', image: png }).length, 0);
});

test('copy from AI node embeds cached prompt and paste retains it after thumbnail conversion', async () => {
  const { c, created } = fixture();
  c.fetch = fetch;
  c.materializeReferenceImage = async ref => ref.image;
  c.window.chrome = { webview: {} };
  let clipboardPng;
  c.window.canvasflowDesktop.copyImage = async (path, image) => { clipboardPng = image; };
  vm.runInContext(app.slice(app.indexOf('async function generationImageForClipboard('), app.indexOf('async function imageBlobAsPng(')), c);
  // Historical output files can lack prompt chunks even while their AI node has the exact prompt.
  const ai = { type: 'ai-image', generatedImage: png, generationPrompt: '六边形地块，低多边形风格', outputPath: 'old-output.png' };
  await c.copyGeneratedImage(ai);
  assert.equal(c.readGenerationMetadataFromPng(clipboardPng).prompt, ai.generationPrompt);
  const pasted = { id: 'pasted-1', type: 'image', image: clipboardPng, x: 0, y: 0 };
  await c.externalizeImageField(pasted, 'image', 'imageAssetId', 'clipboard.png');
  await c.generationKeywordMenuItems(pasted)[0][1]();
  assert.equal(created[0].text, ai.generationPrompt);
});

test('copy also preserves prompt embedded only in the original PNG asset', async () => {
  const { c, stored } = fixture();
  const original = c.embedGenerationMetadata(png, { prompt: '原图中保存的关键词', 'CanvasFlow.Project': '原项目' });
  stored.push(original);
  c.fetch = fetch;
  c.materializeReferenceImage = async () => original;
  vm.runInContext(app.slice(app.indexOf('async function generationImageForClipboard('), app.indexOf('async function imageBlobAsPng(')), c);
  const result = await c.generationImageForClipboard({ type: 'image', imageAssetId: 'asset-1' });
  assert.equal(c.readGenerationMetadataFromPng(result).prompt, '原图中保存的关键词');
});
