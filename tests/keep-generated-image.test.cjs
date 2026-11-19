// 保留 AI 节点内置结果图（2026-11-19 用户要求）：
// ① 复制（cloneNodeForClipboard）AI 绘图/角度节点不再剥离 generatedImage/generatedAssetId，只清运行态——
//    跨项目粘贴要能看到作图结果（收录作图过程场景）；
// ② 保存自定义组件（captureMultiTemplateImages）把 AI 节点内置图收进模板（templateGeneratedId），
//    AI/角度结果图片节点的图也收录且生成提示词保留；
// ③ 插入模板（hydrateMultiTemplateImages）回填 generatedImage 并外部化。
// 全部 vm 切片真实源码；多顶层声明切片直接 runInContext（不能括号包裹）。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `未找到片段起点：${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `未找到片段终点：${endMarker}`);
  return source.slice(start, end);
}

function runIn(context, code) {
  vm.createContext(context);
  vm.runInContext(code, context);
}

const aiNode = extra => ({ id: 'n_ai', type: 'ai-image', seq: 1, prompt: '一只猫', fileName: '喵.png', mime: 'image/png',
  generatedImage: 'data:image/webp;base64,THUMB', generatedAssetId: 'asset_1',
  taskId: 't1', generating: true, _aiProgress: { percent: 50 }, outputPath: 'export/x.png', ...extra });

test('复制 AI 绘图节点：生成结果图保留，运行态清零', () => {
  const cloneCode = slice('function cloneNodeForClipboard(', 'function rekeyContainedGraph(');
  // 桩必须执行回调：克隆的运行态清零走 walkNodes([copy], fn) 分发
  const context = { walkNodes(nodes, fn) { for (const node of nodes || []) fn(node); } };
  runIn(context, cloneCode);
  const copy = context.cloneNodeForClipboard(aiNode());
  assert.equal(copy.generatedImage, 'data:image/webp;base64,THUMB', '缩略图 dataURL 随副本走');
  assert.equal(copy.generatedAssetId, 'asset_1', '原图素材引用保留');
  assert.equal(copy.taskId, null, '运行态清零');
  assert.equal(copy.generating, false);
  // 角度变化节点同样保留
  const angleCopy = context.cloneNodeForClipboard({ id: 'n_ang', type: 'angle-image', generatedImage: 'data:image/png;base64,A', generatedAssetId: 'asset_2', taskId: 't2', generating: true });
  assert.equal(angleCopy.generatedImage, 'data:image/png;base64,A');
  assert.equal(angleCopy.generatedAssetId, 'asset_2');
  // 图片节点本来就不剥离（回归对照）
  const imageCopy = context.cloneNodeForClipboard({ id: 'n_img', type: 'image', image: 'data:image/png;base64,B', imageAssetId: 'asset_3' });
  assert.equal(imageCopy.image, 'data:image/png;base64,B');
  assert.equal(imageCopy.imageAssetId, 'asset_3');
});

function buildCaptureHarness(nodes) {
  const code = slice('function clearGeneratedTemplateState(', 'async function saveSelectionAsMultiNodeTemplate(');
  const imageFiles = [];
  const uploads = [];
  const context = {
    console,
    imageFiles,
    materializeReferenceImage: async ref => ref.image || `asset://${ref.assetId}`,
    storeMultiTemplateImage: async (dataUrl, name, mime, files) => {
      const id = `img_${files.length + 1}`;
      files.push({ id, fileName: `${name}`, mime: mime || 'image/png' });
      uploads.push({ dataUrl, name });
      return id;
    },
    apiFetch: async () => { throw new Error('不应发起 custom-material 请求'); },
  };
  runIn(context, code);
  return { context, uploads, imageFiles, run: async () => context.captureMultiTemplateImages(nodes, imageFiles) };
}

test('保存自定义组件：AI 节点内置图收进模板，运行态仍清零', async () => {
  const node = aiNode();
  const harness = buildCaptureHarness([node]);
  await harness.run();
  assert.ok(node.templateGeneratedId, 'AI 节点带 templateGeneratedId');
  assert.equal(node.generatedImage, null, '捕获后节点本体置空（由 hydrate 回填）');
  assert.equal(node.generatedAssetId, undefined);
  assert.equal(node.taskId, null);
  assert.equal(node.generating, false);
  assert.equal(node.outputPath, '', '陈旧输出路径清掉');
  assert.equal(harness.uploads[0].dataUrl, 'data:image/webp;base64,THUMB', '上传的是物化后的图');
  assert.equal(harness.imageFiles.length, 1);
});

test('保存自定义组件：AI 结果图片节点收录且生成提示词保留；普通图片节点仍剥提示词', async () => {
  const resultNode = { id: 'r1', type: 'image', image: 'data:image/png;base64,RESULT', imageAssetId: 'asset_9', aiSourceNodeId: 'n_ai', fileName: '结果.png', generationPrompt: '一只猫，赛博朋克' };
  const plainNode = { id: 'r2', type: 'image', image: 'data:image/png;base64,PLAIN', fileName: '素材.png', generationPrompt: '不该保留' };
  const harness = buildCaptureHarness([resultNode, plainNode]);
  await harness.run();
  assert.ok(resultNode.templateImageId, '结果节点图已收录');
  assert.equal(resultNode.image, null);
  assert.equal(resultNode.aiSourceNodeId, 'n_ai', '来源标记保留（作图链路可读）');
  assert.equal(resultNode.generationPrompt, '一只猫，赛博朋克', '结果节点生成提示词保留');
  assert.equal(plainNode.generationPrompt, undefined, '普通图片节点仍剥提示词');
  assert.equal(harness.imageFiles.length, 2);
});

test('保存自定义组件：没有结果图的 AI 节点不带 templateGeneratedId（回归）', async () => {
  const bare = { id: 'n_bare', type: 'ai-image', prompt: 'x', generating: true, taskId: 't' };
  const harness = buildCaptureHarness([bare]);
  await harness.run();
  assert.equal(bare.templateGeneratedId, undefined);
  assert.equal(bare.taskId, null);
});

function buildHydrateHarness(nodes, imageFiles) {
  const code = slice('async function hydrateMultiTemplateImages(', 'async function createNodesFromMultiTemplate(');
  const externalized = [];
  const context = {
    console,
    fetch: async () => ({ ok: true, blob: async () => 'BLOB' }),
    blobToBase64: async () => 'data:image/png;base64,RESTORED',
    customMaterialImageUrl: fileName => `http://local/material/${fileName}`,
    externalizeImageField: async (holder, field, assetField) => { externalized.push({ field, assetField, holder }); return true; },
  };
  runIn(context, code);
  return { context, externalized, run: async () => context.hydrateMultiTemplateImages(nodes, imageFiles) };
}

test('插入模板：AI 节点内置图回填并外部化；图片节点路径不变（回归）', async () => {
  const aiRestored = { id: 'a1', type: 'ai-image', fileName: '喵.png', templateGeneratedId: 'img_1' };
  const imgRestored = { id: 'a2', type: 'image', fileName: '素材.png', templateImageId: 'img_2' };
  const harness = buildHydrateHarness([aiRestored, imgRestored], [
    { id: 'img_1', fileName: 'generated.png', mime: 'image/png' },
    { id: 'img_2', fileName: '素材.png', mime: 'image/png' },
  ]);
  await harness.run();
  assert.equal(aiRestored.generatedImage, 'data:image/png;base64,RESTORED');
  assert.equal(aiRestored.templateGeneratedId, undefined);
  assert.equal(imgRestored.image, 'data:image/png;base64,RESTORED');
  assert.equal(imgRestored.templateImageId, undefined);
  assert.deepEqual(harness.externalized.map(item => [item.field, item.assetField]), [['generatedImage', 'generatedAssetId'], ['image', 'imageAssetId']]);
});

test('插入模板：缺记录时报错指名（回归）', async () => {
  const orphan = { id: 'a3', type: 'ai-image', fileName: '丢.png', templateGeneratedId: 'img_404' };
  const harness = buildHydrateHarness([orphan], []);
  await assert.rejects(() => harness.run(), /模板图片记录不存在/);
});
