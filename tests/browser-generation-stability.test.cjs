const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');

// 浏览器生图任务跨项目/撤销/删除稳定性：generateBrowserImage 落位必须按 id 重新解析节点，
// 不允许使用启动时捕获的引用（restoreData 深克隆会替换全部节点对象）。
function fixture() {
  const calls = { addNode: [], addNodeToPageData: [], pushHistory: 0, render: 0, renderNodes: 0, markDirty: 0, toasts: [], renderTaskQueue: 0 };
  const taskNode = {
    id: 'br-1', type: 'browser-image', prompt: '验收', x: 100, y: 100, w: 240, h: 200,
    generating: false, _browserError: '', _browserStatus: '',
  };
  const pageA = { id: 'pageA', name: '项目A', data: { nodes: [] } };
  const c = {
    console: { debug() {}, warn() {}, error() {} },
    setTimeout, clearTimeout,
    state: { nodes: [taskNode], edges: [], activePageId: 'pageA', pages: [pageA] },
    aiTaskQueue: { items: [], nextId: 1 },
    chatRequestSeq: 0,
    BROWSER_TASK_POLL_MS: 5,
    BROWSER_TASK_TIMEOUT_MS: 1000,
    IMAGE_NODE_VERTICAL_STEP: 460,
    findNode: id => (c.state.nodes.find(n => n.id === id) || null),
    currentPage: () => ({ name: '项目A' }),
    taskTargetPage: task => c.state.pages.find(p => p.id === task.pageId) || null,
    nodeFromPageData: (page, nodeId) => (page?.data?.nodes || []).find(n => n.id === nodeId) || null,
    normalizeBrowserNode() {}, browserNodeSiteTarget: () => ({ site: 'gemini' }),
    collectUpstreamForAI: () => ({ texts: [], branches: [], groupImages: [] }),
    buildIncomingIndex: () => null,
    materializeReferenceImage: async () => '',
    addNode: (type, x, y, commit) => { const n = { id: `img-${calls.addNode.length + 1}`, type, x, y }; calls.addNode.push({ type, x, y, commit }); c.state.nodes.push(n); return n; },
    addNodeToPageData: (page, type, x, y) => { const n = { id: `pg-${calls.addNodeToPageData.length + 1}`, type, x, y }; calls.addNodeToPageData.push({ pageId: page.id, type, x, y }); page.data.nodes.push(n); return n; },
    pushHistory: () => { calls.pushHistory++; },
    render: () => { calls.render++; },
    renderNodes: () => { calls.renderNodes++; },
    renderTaskQueue: () => { calls.renderTaskQueue++; },
    markDirty: () => { calls.markDirty++; },
    toast: text => { calls.toasts.push(text); },
    apiFetch: null,
  };
  vm.createContext(c);
  vm.runInContext(app.slice(app.indexOf('async function generateBrowserImage('), app.indexOf('let screenshotCatalogSignature')), c);
  return { c, calls, taskNode, pageA };
}

function jsonOk(data) { return { ok: true, status: 200, json: async () => data }; }

// 创建任务返回 taskId；status 响应由用例逐个投喂
function mockApiFetch(c, { onStatus, onCreate } = {}) {
  c.apiFetch = async (url, init) => {
    if (url.startsWith('/api/browser-task/status/')) {
      const next = onStatus && onStatus(url);
      return jsonOk(next || { status: 'waiting' });
    }
    if (onCreate) onCreate();
    return jsonOk({ taskId: 'bt-1' });
  };
}

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6l8AAAAASUVORK5CYII=';

test('迟到结果在节点已删除时被安全丢弃：任务取消、不建图片节点、不进撤销栈', async () => {
  const { c, calls } = fixture();
  mockApiFetch(c, { onStatus: () => ({ status: 'completed', images: [png] }) });
  // 启动后节点从画布消失（撤销/删除）：findNode 首次命中，其后恒空
  const originalFind = c.findNode;
  let first = true;
  c.findNode = id => { if (first) { first = false; return originalFind(id); } return null; };
  await c.generateBrowserImage('br-1');
  const queueTask = c.aiTaskQueue.items[0];
  assert.equal(queueTask.status, 'cancelled');
  assert.equal(calls.addNode.length, 0);
  assert.equal(calls.addNodeToPageData.length, 0);
  assert.equal(calls.pushHistory, 0);
  assert.equal(calls.toasts.length, 0);
});

test('跨项目切换后完成：结果写回任务所属项目的 page.data，多余图片节点不进当前画布', async () => {
  const { c, calls, taskNode, pageA } = fixture();
  let switched = false;
  let snapshot = null;
  mockApiFetch(c, {
    onCreate: () => {},
    onStatus: () => {
      if (!switched) {
        // 模拟切换项目：saveCurrentPage 深克隆当前节点（保留运行时字段）→ 当前画布换成项目 B
        switched = true;
        snapshot = { ...taskNode };
        pageA.data.nodes.push(snapshot);
        c.state.activePageId = 'pageB';
        c.state.nodes = [];
      }
      return { status: 'completed', images: [png, png] };
    },
  });
  await c.generateBrowserImage('br-1');
  assert.equal(snapshot.generatedImage, png);
  assert.equal(snapshot.generating, false);
  assert.equal(calls.addNode.length, 0); // 多余图片不进当前画布（项目 B）
  assert.equal(calls.addNodeToPageData.length, 1);
  assert.equal(calls.addNodeToPageData[0].pageId, 'pageA');
  assert.equal(calls.markDirty, 1);
  assert.equal(calls.pushHistory, 0); // 离页变更不进当前页撤销历史
  assert.equal(calls.render, 1); // 仅启动置位时 render 一次，完成走离页持久化不再 render
  assert.match(calls.toasts.at(-1), /落回项目「项目A」/);
  const queueTask = c.aiTaskQueue.items[0];
  assert.equal(queueTask.status, 'done');
});

test('同页正常完成：首图进节点预览、多余图片节点进当前画布并进入撤销栈', async () => {
  const { c, calls, taskNode } = fixture();
  mockApiFetch(c, { onStatus: () => ({ status: 'completed', images: [png, png] }) });
  await c.generateBrowserImage('br-1');
  assert.equal(taskNode.generatedImage, png);
  assert.equal(taskNode.generating, false);
  assert.equal(calls.addNode.length, 1);
  assert.equal(calls.addNodeToPageData.length, 0);
  assert.equal(calls.pushHistory, 1);
  assert.equal(calls.render, 2); // 启动置位 render + 完成落位 render
  assert.equal(calls.markDirty, 0); // 同页不走离页持久化
  assert.equal(calls.toasts.at(-1), '浏览器生成完成，共 2 张');
});

test('取消后不再写回：活节点丢失请求序列号时任务标记取消且不落位', async () => {
  const { c, calls, taskNode } = fixture();
  mockApiFetch(c, { onStatus: () => ({ status: 'completed', images: [png] }) });
  // 模拟用户点击停止按钮：清空运行时字段（同 browser-cancel 处理器）
  const originalFind = c.findNode;
  let polled = false;
  c.findNode = id => {
    if (polled) { delete taskNode._browserRequestId; delete taskNode._browserTaskId; }
    return originalFind(id);
  };
  // 用 onStatus 钩子在首轮轮询前置位
  c.apiFetch = async (url) => {
    if (url.startsWith('/api/browser-task/status/')) { polled = true; return jsonOk({ status: 'completed', images: [png] }); }
    return jsonOk({ taskId: 'bt-1' });
  };
  await c.generateBrowserImage('br-1');
  assert.equal(c.aiTaskQueue.items[0].status, 'cancelled');
  assert.equal(taskNode.generatedImage, undefined);
  assert.equal(calls.pushHistory, 0);
});

test('失败结果写回活节点错误信息并进入任务面板', async () => {
  const { c, calls, taskNode } = fixture();
  mockApiFetch(c, { onStatus: () => ({ status: 'failed', error: '站点未返回图片' }) });
  await c.generateBrowserImage('br-1');
  assert.equal(c.aiTaskQueue.items[0].status, 'failed');
  assert.equal(c.aiTaskQueue.items[0].error, '站点未返回图片');
  assert.equal(taskNode.generating, false);
  assert.equal(taskNode._browserError, '站点未返回图片');
});
