// AI 任务结果落位连线：vm 切片 applyQueuedResult 真实源码,不发起任何请求。
// 锁死三个事实：① image-node 结果(多任务/批量/多支线)创建结果图片节点时,
// 必须把结果节点用连线挂回生成节点(整链读作 上游→AI→结果);
// ② 离页落位(任务属于其他项目)时,连线写入目标项目的 page.data.edges;
// ③ node-preview 模式结果留在节点预览内,不新建节点也不产生连线。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

const SLICE_START = 'async function applyQueuedResult(';
const SLICE_END = '\nfunction recordNodePendingResults';

function buildHarness({ page = null, existingPageEdges = [] } = {}) {
  const start = source.indexOf(SLICE_START);
  assert.ok(start > 0, 'slice start marker not found');
  const end = source.indexOf(SLICE_END, start);
  assert.ok(end > start, 'slice end marker not found');
  const slice = source.slice(start, end);

  const aiNode = { id: 'ai1', type: 'ai-image', x: 100, y: 200, h: 400 };
  const created = [];
  const state = { edges: [] };
  let historyPushes = 0;
  let dirtyMarks = 0;
  const context = {
    state,
    embedGenerationMetadata: (dataUrl, meta) => { context.lastMetadata = meta; return dataUrl; },
    generationMetadataFor: () => ({ prompt: '提示词', 'CanvasFlow.Project': '项目', 'CanvasFlow.Time': '0', 'CanvasFlow.TaskId': 'q1' }),
    saveGeneratedOutput: async () => ({ fileName: 'result.png', outputPath: 'out/result.png', assetId: 'asset-1' }),
    taskTargetPage: () => page,
    nodeFromPageData: (pg, nodeId) => pg?.data?.nodes?.find(node => node.id === nodeId) || null,
    addNode: (type, x, y) => { const node = { id: `r${created.length + 1}`, type, x, y }; created.push(node); return node; },
    addNodeToPageData: (pg, type, x, y) => { const node = { id: `rp${created.length + 1}`, type, x, y }; pg.data.nodes.push(node); created.push(node); return node; },
    externalizeImageField: async () => {},
    pushHistory: () => { historyPushes++; },
    render: () => {},
    markDirty: () => { dirtyMarks++; },
    uid: () => `e${state.edges.length + 1}`,
    NODE_WIDTH: 220,
    NODE_HEIGHT: 160,
    IMAGE_NODE_VERTICAL_STEP: 260,
    console,
  };
  vm.createContext(context);
  const run = vm.runInContext(`(${slice}\n)`, context);
  return { run, aiNode, created, state, page, marks: () => ({ historyPushes, dirtyMarks }) };
}

const makeTask = overrides => ({ id: 'q1', nodeId: 'ai1', prompt: '提示词', groupIndex: -1, resultMode: 'image-node', resultOrder: 0, resultCount: 1, ...overrides });

test('image-node 结果:结果节点挂回 AI 节点(aiSourceNodeId + 连线)', async () => {
  const { run, aiNode, created, state, marks } = buildHarness();
  await run(makeTask({}), aiNode, 'data:image/png;base64,AAA');
  assert.equal(created.length, 1, '结果图片节点已创建');
  const result = created[0];
  assert.equal(result.aiSourceNodeId, 'ai1', '结果必须记录来源 AI 节点');
  assert.equal(result.x, 100 + 220 + 40, '落位在 AI 节点右侧');
  assert.equal(state.edges.length, 1, '必须产生一条连线');
  assert.deepEqual(JSON.parse(JSON.stringify(state.edges[0])), { id: 'e1', from: { node: 'ai1', port: 'out' }, to: { node: result.id, port: 'in' } });
  assert.equal(marks().historyPushes, 1, '在页落位推一次历史');
  assert.equal(marks().dirtyMarks, 0);
});

test('node-preview 结果:留在节点预览,不建节点不连线', async () => {
  const { run, aiNode, created, state, marks } = buildHarness();
  await run(makeTask({ resultMode: 'node-preview' }), aiNode, 'data:image/png;base64,AAA');
  assert.equal(created.length, 0, '不新建结果节点');
  assert.equal(aiNode.generatedImage, 'data:image/png;base64,AAA', '结果进节点预览');
  assert.equal(state.edges.length, 0, '无连线');
  assert.equal(marks().historyPushes, 1);
});

test('离页落位:节点与连线都写进目标项目 page.data', async () => {
  const page = { id: 'p2', name: '其他项目', data: { nodes: [{ id: 'ai1', type: 'ai-image', x: 0, y: 0 }], edges: [] } };
  const { run, created, state, marks } = buildHarness({ page });
  const pageNode = page.data.nodes[0];
  await run(makeTask({ pageId: 'p2' }), pageNode, 'data:image/png;base64,AAA');
  assert.equal(created.length, 1);
  assert.equal(page.data.nodes.length, 2, '结果节点进目标项目');
  assert.equal(state.edges.length, 0, '当前画布不得混入其他项目的连线');
  assert.equal(page.data.edges.length, 1, '连线写入目标项目边表');
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.edges[0])), { id: 'e1', from: { node: 'ai1', port: 'out' }, to: { node: created[0].id, port: 'in' } });
  assert.equal(marks().dirtyMarks, 1, '离页直接持久化,不进当前撤销历史');
  assert.equal(marks().historyPushes, 0);
});

test('多任务批量结果(11 张)逐张落位:每张各自连线,网格排布不重叠', async () => {
  const { run, aiNode, created, state } = buildHarness();
  for (let i = 0; i < 11; i++) {
    await run(makeTask({ id: `q${i}`, groupIndex: i, resultOrder: i, resultCount: 11 }), aiNode, `data:image/png;base64,IMG${i}`);
  }
  assert.equal(created.length, 11);
  assert.equal(state.edges.length, 11, '每张结果一条连线');
  assert.ok(state.edges.every(edge => edge.from.node === 'ai1'), '全部挂回 AI 节点');
  const coords = created.map(node => `${node.x},${node.y}`);
  assert.equal(new Set(coords).size, 11, '网格位置互不重叠');
});
