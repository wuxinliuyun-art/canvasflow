// 拖节点插入连线 × 画布编组（2026-11-25 用户反馈）：两端同属一个编组时，
// 插入节点必须随链路入组并刷新组框；无组/异组/已在别的编组时不得抢成员。
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

// 编组核心（含 canvasGroupBounds/canvasGroupMembers）+ 插入函数 + 可插入判定
const GROUP_CODE = slice('const CANVAS_GROUP_PAD_X', 'function ungroupNode(');
const INSERT_CODE = slice('function insertNodeIntoEdge(', 'function renameEdge(');
const INSERTABLE_CODE = slice('function edgeInsertableNode(', '// 文字节点重合合并');

function makeContext({ nodes, edges, frames = {} }) {
  const history = [];
  const toasts = [];
  const state = {
    nodes,
    edges,
    canvasGroupFrames: frames,
    canvasGroupNames: {},
    canvasGroupCollapsed: {},
    selected: new Set(),
  };
  const context = {
    state,
    history,
    toasts,
    window: {},
    canvasGroupRuns: new Map(),
    NODE_WIDTH: 240,
    NODE_HEIGHT: 172,
    uid: prefix => `${prefix}-test`,
    findNode: id => state.nodes.find(node => node.id === id),
    toast: message => toasts.push(message),
    render() {},
    pushHistory() { history.push(JSON.parse(JSON.stringify({ nodes: state.nodes, frames: state.canvasGroupFrames }))); },
    notifyVectorizeInputsChanged() {},
    console,
    isLinkedUpscaleNode: () => false,
    isAutoMattingTool: () => false,
  };
  vm.createContext(context);
  for (const code of [GROUP_CODE, INSERTABLE_CODE, INSERT_CODE]) vm.runInContext(code, context);
  return { context, state, history, toasts };
}

const edge = (from, to) => ({ id: `e-${from}-${to}`, from: { node: from, port: 'out' }, to: { node: to, port: 'in' }, label: '' });
const textNode = (id, gid, x) => ({ id, type: 'text', text: id.toUpperCase(), canvasGroupId: gid || undefined, x, y: 100, w: 240, h: 172 });

test('两端同编组：插入节点自动入组并刷新组框', () => {
  const nodes = [textNode('a', 'g', 0), textNode('b', 'g', 400), { id: 'n', type: 'image', image: '', x: 200, y: 400, w: 240, h: 300 }];
  const { context, state, history, toasts } = makeContext({
    nodes,
    edges: [edge('a', 'b')],
    frames: { g: { x: -16, y: 52, w: 672, h: 236 } },
  });
  assert.ok(context.insertNodeIntoEdge('e-a-b', 'n'), '插入应成功');
  const inserted = state.nodes.find(node => node.id === 'n');
  assert.strictEqual(inserted.canvasGroupId, 'g', '插入节点必须加入两端所在编组');
  // 组框按新成员范围刷新：包含 n 的底边（400+300+16）与右移后的范围
  const frame = state.canvasGroupFrames.g;
  assert.ok(frame.h >= 400 + 300 + 16 - (100 - 48), `组框必须覆盖新成员（h=${frame.h}）`);
  assert.ok(history.length === 1, '入组随插入一次入撤销栈');
  assert.ok(toasts.some(message => message.includes('加入编组')), '提示语应说明已加入编组');
  // 连线已串成 a→n→b
  assert.ok(state.edges.some(e => e.from.node === 'a' && e.to.node === 'n'));
  assert.ok(state.edges.some(e => e.from.node === 'n' && e.to.node === 'b'));
});

test('两端无编组：插入节点保持无组', () => {
  const nodes = [textNode('a', '', 0), textNode('b', '', 400), { id: 'n', type: 'image', image: '', x: 200, y: 400, w: 240, h: 300 }];
  const { context, state, toasts } = makeContext({ nodes, edges: [edge('a', 'b')] });
  assert.ok(context.insertNodeIntoEdge('e-a-b', 'n'));
  assert.strictEqual(state.nodes.find(node => node.id === 'n').canvasGroupId, undefined, '无组链路不产生成员');
  assert.ok(!toasts.some(message => message.includes('加入编组')));
});

test('两端异编组：插入节点不入任何组', () => {
  const nodes = [textNode('a', 'g1', 0), textNode('b', 'g2', 400), { id: 'n', type: 'image', image: '', x: 200, y: 400, w: 240, h: 300 }];
  const { context, state } = makeContext({ nodes, edges: [edge('a', 'b')] });
  assert.ok(context.insertNodeIntoEdge('e-a-b', 'n'));
  assert.strictEqual(state.nodes.find(node => node.id === 'n').canvasGroupId, undefined, '异组两端不抢成员');
});

test('插入节点已在别的编组：成员不变', () => {
  const nodes = [textNode('a', 'g', 0), textNode('b', 'g', 400), { id: 'n', type: 'image', image: '', x: 200, y: 400, w: 240, h: 300, canvasGroupId: 'other' }];
  const { context, state } = makeContext({ nodes, edges: [edge('a', 'b')] });
  assert.ok(context.insertNodeIntoEdge('e-a-b', 'n'));
  assert.strictEqual(state.nodes.find(node => node.id === 'n').canvasGroupId, 'other', '已在别的编组的节点不迁移');
});

test('静态接线：修复只落在 insertNodeIntoEdge，toast 提到编组', () => {
  assert.match(source, /两端同属一个编组时，插入节点随链路入组并刷新组框/);
  assert.match(source, /joinedGroup \? "已将节点插入连线，自动连接两端并加入编组" : "已将节点插入连线，自动连接两端"/);
  assert.match(source, /canvasGroupBounds\(canvasGroupMembers\(joinedGroup\)\)/);
});
