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

// 只取编组本身的逻辑，不牵扯小地图、AI 队列等其它模块
const GROUP_CODE = slice('const CANVAS_GROUP_PAD_X', 'function ungroupNode(');
const MOUSEDOWN_CODE = slice('els.viewport.addEventListener("mousedown"', 'window.addEventListener("mousemove"');
const MOUSEMOVE_CODE = slice('window.addEventListener("mousemove"', 'window.addEventListener("mouseup"');
const MOUSEUP_CODE = slice('window.addEventListener("mouseup"', 'function findNearbyInputNode(');
const DELETE_CODE = slice('function deleteNodes(', 'const CLIPBOARD_NODES_HTML_MARK');
const COPY_CODE = slice('async function copySelection(', 'function cloneNodeForClipboard(');
// 旧线 v2.7.8 合并后 stripCopiedImage 已统一进 cloneNodeForClipboard（重置语义经 walkNodes 覆盖编组内嵌套节点）
const STRIP_CODE = slice('function cloneNodeForClipboard(', 'function rekeyContainedGraph(');
const REKEY_CODE = slice('function rekeyContainedGraph(', 'function pasteNodes(');
const PASTE_CODE = slice('function pasteNodes(', 'function addEdge(');
const CLONE_CODE = slice('function cloneData(', 'function currentPage(');
const RESTORE_CODE = (() => {
  const region = slice('function restoreData(', 'function inferNext(');
  const start = region.indexOf('state.canvasGroupFrames =');
  const tail = 'state.selectedCanvasGroupId = "";';
  const end = region.indexOf(tail) + tail.length;
  assert.ok(start >= 0 && end > start, '未能在 restoreData 中定位编组状态恢复语句');
  return region.slice(start, end);
})();

const plain = value => JSON.parse(JSON.stringify(value));

const NODE_WIDTH = 240;
const NODE_HEIGHT = 160;

function baseState({ scale = 1, snap = false, gridSize = 40 } = {}) {
  return {
    nodes: [
      { id: 'a', type: 'text', text: 'A', canvasGroupId: 'g', x: 10, y: 20, w: 100, h: 80 },
      { id: 'b', type: 'text', text: 'B', canvasGroupId: 'g', x: 160, y: 120, w: 120, h: 90 },
      { id: 'c', type: 'text', text: 'C', x: 500, y: 400, w: 100, h: 80 },
    ],
    selected: new Set(),
    selectedCanvasGroupId: '',
    canvasGroupFrames: {},
    canvasGroupNames: {},
    view: { x: 40, y: -20, scale },
    settings: { gridSize, snap },
    edges: [],
  };
}

function makeContext(state, extra = {}) {
  const history = [];
  const toasts = [];
  const listeners = {};
  const viewportListeners = {};
  const context = {
    state,
    history,
    toasts,
    drag: null,
    cutStroke: null,
    connectDraft: null,
    selectionDraft: null,
    spaceDown: false,
    altDown: false,
    compositeHoverReady: false,
    compositeHoverTargetId: '',
    nodeReleaseTargetId: '',
    nodeHoldTimer: 0,
    edgeDropArmed: false,
    edgeDropTargetId: '',
    NODE_RELEASE_HOLD_MS: 500,
    NODE_WIDTH,
    NODE_HEIGHT,
    AI_NODE_HEIGHT: 300,
    ANGLE_NODE_HEIGHT: 300,
    SCREENSHOT_NODE_HEIGHT: 220,
    GROUP_NODE_HEIGHT: 260,
    findNode: id => state.nodes.find(node => node.id === id),
    snap: value => state.settings.snap ? Math.round(value / state.settings.gridSize) * state.settings.gridSize : value,
    screenToWorld: (x, y) => ({ x: (x - state.view.x) / state.view.scale, y: (y - state.view.y) / state.view.scale }),
    uid: prefix => `${prefix}-1`,
    toast: message => toasts.push(message),
    render() {},
    renderNodes() {},
    renderEdges() {},
    pushHistory() { history.push(plain({ nodes: state.nodes, frames: state.canvasGroupFrames })); },
    hideMenu() {},
    syncAnnotationSelectionClasses() {},
    syncAnnotationPositions() {},
    syncSelectedNodeClasses() {},
    updateSelectionBox() {},
    scheduleInteractiveRender() {},
    clearNodeRelease() {},
    clearCompositeHover() {},
    clearEdgeDropHover() {},
    updateCompositeHover() {},
    updateEdgeDropHover() {},
    armNodeRelease() {},
    mergeTextNodeTexts() {},
    openNodeCompositeEditor() {},
    saveCurrentPage() {},
    persistPages() {},
    renderCutStroke() {},
    applyCutStroke() {},
    insertNodeIntoEdge: () => false,
    findAnnotation: () => null,
    findNearbyInputNode: () => null,
    addEdge() {},
    normalizedRect: (start, end) => ({
      x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y),
    }),
    intersects: (r, n) => r.x < n.x + n.w && r.x + r.w > n.x && r.y < n.y + n.h && r.y + r.h > n.y,
    edgeInsertableNode() { throw new Error('整组拖动不应把成员插进连线'); },
    window: {
      addEventListener: (name, fn) => { listeners[name] = fn; },
      setTimeout() {},
      requestAnimationFrame() {},
    },
    els: {
      viewport: { addEventListener: (name, fn) => { viewportListeners[name] = fn; }, focus() {} },
      projectMenu: { classList: { add() {} } },
      selectionBox: { classList: { add() {} } },
      nodes: { querySelectorAll: () => [], querySelector: () => null },
    },
    document: { querySelector: () => null, elementFromPoint: () => null },
    navigator: {},
    console: { log() {} },
    ...extra,
  };
  context.__listeners = listeners;
  context.__viewportListeners = viewportListeners;
  return context;
}

function loadGroupLogic(context) {
  vm.runInNewContext(GROUP_CODE, context);
  return context;
}

function loadDragHandlers(context) {
  loadGroupLogic(context);
  vm.runInNewContext(MOUSEDOWN_CODE, context);
  vm.runInNewContext(MOUSEMOVE_CODE, context);
  vm.runInNewContext(MOUSEUP_CODE, context);
  return context;
}

function makeTarget(kind, id = 'a') {
  const node = { dataset: { id } };
  const frame = { dataset: { groupId: 'g' } };
  return {
    closest(selector) {
      if (selector === '.node') return ['node', 'control', 'port', 'resize'].includes(kind) ? node : null;
      if (selector === '.node-group-frame') return ['frame', 'blank', 'label'].includes(kind) ? frame : null;
      if (selector.startsWith('textarea,button,')) return kind === 'control' ? {} : null;
      if (selector === '.port' && kind === 'port') return { dataset: { port: 'out' } };
      if (selector === '.resize-handle' && kind === 'resize') return {};
      return null;
    },
  };
}

function setup({ scale = 1, snap = false, gridSize = 40 } = {}) {
  const state = baseState({ scale, snap, gridSize });
  const context = loadDragHandlers(makeContext(state));
  // 与真实运行一致：首帧渲染就会把外框拟合出来
  context.canvasGroupBounds(state.nodes.filter(node => node.canvasGroupId === 'g'));
  let nextHistoryBefore = 0;
  function emit(name, kind = 'node', point = { x: 50, y: 50 }, properties = {}) {
    const event = {
      button: 0, shiftKey: false, target: makeTarget(kind),
      clientX: state.view.x + point.x * scale, clientY: state.view.y + point.y * scale,
      preventDefault() {}, ...properties,
    };
    const handler = name === 'mousedown'
      ? context.__viewportListeners[name]
      : context.__listeners[name];
    assert.equal(typeof handler, 'function', `未注册 ${name} 监听`);
    nextHistoryBefore = context.history.length;
    handler(event);
  }
  return { context, state, emit, history: context.history, toasts: context.toasts };
}

function frameOf(state, groupId = 'g') {
  return plain(state.canvasGroupFrames[groupId]);
}

// ── 编组 / 解散 ─────────────────────────────────────────────────────────────

test('多选两个节点可编组，外框按成员范围拟合', () => {
  const state = baseState();
  delete state.nodes[0].canvasGroupId;
  delete state.nodes[1].canvasGroupId;
  const context = loadGroupLogic(makeContext(state));
  state.selected = new Set(['a', 'b']);
  context.groupCanvasSelection();
  assert.equal(state.nodes[0].canvasGroupId, 'canvas-group-1');
  assert.equal(state.nodes[1].canvasGroupId, 'canvas-group-1');
  assert.equal(state.nodes[2].canvasGroupId, undefined);
  assert.deepEqual([...state.selected].sort(), ['a', 'b']);
  assert.deepEqual(frameOf(state, 'canvas-group-1'), { x: -6, y: -8, w: 302, h: 234 });
  assert.equal(context.history.length, 1);
});

test('对已编组成员再次编组时会带上同组其它成员', () => {
  const state = baseState();
  const context = loadGroupLogic(makeContext(state));
  state.selected = new Set(['a']);
  assert.deepEqual([...context.expandCanvasGroupIds(new Set(['a']))].sort(), ['a', 'b']);
  context.groupCanvasSelection();
  assert.equal(state.nodes[0].canvasGroupId, 'canvas-group-1');
  assert.equal(state.nodes[1].canvasGroupId, 'canvas-group-1');
  assert.equal(state.nodes[2].canvasGroupId, undefined);
  assert.deepEqual(frameOf(state, 'canvas-group-1'), { x: -6, y: -8, w: 302, h: 234 });
});

test('单个节点不能编组，给出提示且不改数据', () => {
  const state = baseState();
  const context = loadGroupLogic(makeContext(state));
  state.selected = new Set(['c']);
  context.groupCanvasSelection();
  assert.equal(state.nodes[2].canvasGroupId, undefined);
  assert.equal(context.toasts.at(-1), '至少选中 2 个节点才能创建编组');
  assert.equal(context.history.length, 0);
});

test('解散编组会清掉组 ID 与外框，保留全部节点', () => {
  const state = baseState();
  const context = loadGroupLogic(makeContext(state));
  context.canvasGroupBounds(state.nodes.slice(0, 2));
  state.selected = new Set(['a']);
  context.ungroupCanvasSelection();
  assert.equal(state.nodes.length, 3);
  assert.equal(state.nodes[0].canvasGroupId, undefined);
  assert.equal(state.nodes[1].canvasGroupId, undefined);
  assert.equal(state.nodes[2].canvasGroupId, undefined);
  assert.deepEqual(plain(state.canvasGroupFrames), {});
  assert.equal(state.selectedCanvasGroupId, '');
});

// ── 拖动与碰撞 ──────────────────────────────────────────────────────────────

test('拖动外框可整组移动，组外节点不受影响', () => {
  const h = setup({ scale: 2 });
  h.state.selected.add('c');
  const before = plain(h.state.nodes);
  const bounds = frameOf(h.state);
  h.emit('mousedown', 'frame');
  assert.equal(h.context.drag.type, 'canvas-group');
  assert.equal(h.context.selectionDraft, null);
  assert.deepEqual([...h.state.selected], ['a', 'b']);
  h.emit('mousemove', 'frame', { x: 85, y: 75 });
  assert.equal(h.state.nodes[0].x, before[0].x + 35);
  assert.equal(h.state.nodes[0].y, before[0].y + 25);
  assert.equal(h.state.nodes[1].x, before[1].x + 35);
  assert.equal(h.state.nodes[1].y, before[1].y + 25);
  assert.deepEqual(h.state.nodes[2], before[2]);
  assert.deepEqual(frameOf(h.state), { ...bounds, x: bounds.x + 35, y: bounds.y + 25 });
  h.emit('mouseup', 'frame');
  assert.equal(h.history.length, 1);
  assert.equal(h.context.drag, null);
});

test('先选外框再点成员，切换为只移动该成员并收缩外框', () => {
  const h = setup();
  h.emit('mousedown', 'frame');
  h.emit('mouseup', 'frame');
  const before = plain(h.state.nodes);
  const bounds = frameOf(h.state);
  h.emit('mousedown');
  assert.deepEqual([...h.state.selected], ['a']);
  assert.equal(h.context.drag.type, 'nodes');
  h.emit('mousemove', 'node', { x: 90, y: 90 });
  assert.deepEqual(h.state.nodes.slice(1), before.slice(1));
  assert.ok(frameOf(h.state).w < bounds.w);
});

for (const point of [{ x: -150, y: 50 }, { x: 400, y: 50 }, { x: 50, y: -150 }, { x: 50, y: 400 }]) {
  test(`成员单独拖到 (${point.x}, ${point.y}) 后外框仍贴合所有成员，拖回即复原`, () => {
    const h = setup();
    const before = plain(h.state.nodes);
    const original = frameOf(h.state);
    h.emit('mousedown');
    h.emit('mousemove', 'node', point);
    const node = h.state.nodes[0];
    const other = h.state.nodes[1];
    const frame = h.state.canvasGroupFrames.g;
    assert.deepEqual(h.state.nodes.slice(1), before.slice(1));
    assert.equal(node.canvasGroupId, 'g');
    assert.equal(frame.x, Math.min(other.x, node.x) - 16);
    assert.equal(frame.y, Math.min(other.y, node.y) - 28);
    assert.equal(frame.x + frame.w, Math.max(other.x + other.w, node.x + node.w) + 16);
    assert.equal(frame.y + frame.h, Math.max(other.y + other.h, node.y + node.h) + 16);
    h.emit('mousemove');
    assert.deepEqual(frameOf(h.state), original);
  });
}

for (const { obstacle, point, edge } of [
  { obstacle: { x: 350, y: 0, w: 100, h: 300 }, point: { x: 2000, y: 50 }, edge: 'right' },
  { obstacle: { x: -150, y: 0, w: 100, h: 300 }, point: { x: -2000, y: 50 }, edge: 'left' },
  { obstacle: { x: 0, y: -150, w: 300, h: 100 }, point: { x: 50, y: -2000 }, edge: 'top' },
  { obstacle: { x: 0, y: 300, w: 300, h: 100 }, point: { x: 50, y: 2000 }, edge: 'bottom' },
]) {
  test(`快速拖动时 ${edge} 方向扩张精确停在组外节点边缘`, () => {
    const h = setup();
    Object.assign(h.state.nodes[2], obstacle);
    const siblings = plain(h.state.nodes.slice(1));
    h.emit('mousedown');
    h.emit('mousemove', 'node', point);
    const frame = h.state.canvasGroupFrames.g;
    if (edge === 'right') assert.equal(frame.x + frame.w, obstacle.x);
    if (edge === 'left') assert.equal(frame.x, obstacle.x + obstacle.w);
    if (edge === 'top') assert.equal(frame.y, obstacle.y + obstacle.h);
    if (edge === 'bottom') assert.equal(frame.y + frame.h, obstacle.y);
    assert.ok(h.context.drag.blockedGroups.has('g'));
    assert.deepEqual(h.state.nodes.slice(1), siblings);
    h.emit('mousemove');
    assert.equal(h.state.nodes[0].x, 10);
    assert.equal(h.state.nodes[0].y, 20);
    assert.equal(h.context.drag.blockedGroups.size, 0);
  });
}

test('受阻后沿障碍边滑行，碰撞限制优先于网格吸附', () => {
  const h = setup({ snap: true });
  Object.assign(h.state.nodes[2], { x: 350, y: 0, w: 100, h: 300 });
  h.emit('mousedown');
  h.emit('mousemove', 'node', { x: 2000, y: 50 });
  const x = h.state.nodes[0].x;
  const y = h.state.nodes[0].y;
  assert.equal(x + h.state.nodes[0].w + 16, 350);
  assert.notEqual(x % 40, 0, '碰撞结果不应被吸附回网格');
  h.emit('mousemove', 'node', { x: 2000, y: 100 });
  assert.equal(h.state.nodes[0].x, x);
  assert.ok(h.state.nodes[0].y > y);
});

test('整组移动会被组外节点挡住，成员相对间距保持不变', () => {
  const h = setup();
  Object.assign(h.state.nodes[2], { x: 350, y: 0, w: 100, h: 300 });
  h.emit('mousedown', 'frame');
  h.emit('mousemove', 'frame', { x: 500, y: 50 });
  assert.equal(h.state.nodes[0].x, 64);
  assert.equal(h.state.nodes[1].x, 214);
  assert.equal(h.state.canvasGroupFrames.g.x + h.state.canvasGroupFrames.g.w, 350);
  assert.ok(h.context.drag.blockedGroups.has('g'));
  h.emit('mousemove', 'frame');
  assert.equal(h.state.nodes[0].x, 10);
  assert.equal(h.state.nodes[1].x, 160);
  assert.equal(h.context.drag.blockedGroups.size, 0);
});

test('拐角接触同样视为阻挡，不会从角上穿过组外节点', () => {
  const h = setup();
  Object.assign(h.state.nodes[2], { x: 350, y: 226, w: 100, h: 100 });
  h.emit('mousedown');
  h.emit('mousemove', 'node', { x: 2000, y: 50 });
  assert.equal(h.state.canvasGroupFrames.g.x + h.state.canvasGroupFrames.g.w, 350);
  assert.ok(h.context.drag.blockedGroups.has('g'));
});

test('已轻微重叠的边不能继续扩张，但允许反向退出', () => {
  const h = setup();
  Object.assign(h.state.nodes[2], { x: 295.5, y: 0, w: 100, h: 300 });
  h.emit('mousedown', 'node', { x: 200, y: 150 }, { target: makeTarget('node', 'b') });
  h.emit('mousemove', 'node', { x: 2000, y: 150 });
  assert.equal(h.state.nodes[1].x, 160);
  assert.equal(h.state.canvasGroupFrames.g.x + h.state.canvasGroupFrames.g.w, 296);
  assert.ok(h.context.drag.blockedGroups.has('g'));
  h.emit('mousemove', 'node', { x: 150, y: 150 });
  assert.equal(h.state.nodes[1].x, 110);
  assert.equal(h.context.drag.blockedGroups.size, 0);
});

test('碰撞矩形对字符串尺寸和缺失宽高使用与编组一致的默认值', () => {
  const h = setup();
  Object.assign(h.state.nodes[2], { x: -150, y: 0, w: '100', h: '300' });
  h.emit('mousedown');
  h.emit('mousemove', 'node', { x: -2000, y: 50 });
  assert.equal(h.state.canvasGroupFrames.g.x, -50);

  const legacy = setup();
  Object.assign(legacy.state.nodes[2], { x: -350, y: 0, h: 300 });
  delete legacy.state.nodes[2].w;
  legacy.emit('mousedown');
  legacy.emit('mousemove', 'node', { x: -2000, y: 50 });
  assert.equal(legacy.state.canvasGroupFrames.g.x, -110);
});

test('不同缩放比例下反复斜向拖动都不会让整组穿过组外节点', () => {
  let seed = 42;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const obstacles = [
    { x: 350, y: 0, w: 100, h: 300 }, { x: -150, y: 0, w: 100, h: 300 },
    { x: 0, y: -150, w: 300, h: 100 }, { x: 0, y: 300, w: 300, h: 100 },
    { x: 350, y: 300, w: 100, h: 100 }, { x: -150, y: -150, w: 100, h: 100 },
  ];
  for (const kind of ['node', 'frame']) for (const scale of [0.25, 1, 2.5]) for (const obstacle of obstacles) {
    const h = setup({ scale, snap: true });
    Object.assign(h.state.nodes[2], obstacle);
    const stationary = plain(h.state.nodes[2]);
    h.emit('mousedown', kind);
    for (let i = 0; i < 30; i++) {
      h.emit('mousemove', kind, { x: random() * 4000 - 2000, y: random() * 4000 - 2000 });
      const r = h.state.canvasGroupFrames.g;
      const overlap = r.x < obstacle.x + obstacle.w - 1e-7 && r.x + r.w > obstacle.x + 1e-7
        && r.y < obstacle.y + obstacle.h - 1e-7 && r.y + r.h > obstacle.y + 1e-7;
      assert.equal(overlap, false, JSON.stringify({ kind, scale, obstacle, r }));
      assert.deepEqual(h.state.nodes[2], stationary);
    }
  }
});

test('拉伸成员撑开外框时受组外节点限制，缩小时可自由回退', () => {
  const h = setup();
  Object.assign(h.state.nodes[2], { x: 350, y: 0, w: 100, h: 300 });
  h.emit('mousedown', 'resize');
  h.emit('mousemove', 'resize', { x: 2000, y: 50 });
  assert.equal(h.state.nodes[0].x + h.state.nodes[0].w + 16, 350);
  assert.ok(h.context.drag.blockedGroups.has('g'));
  h.emit('mousemove', 'resize');
  assert.equal(h.state.nodes[0].w, 180);
  assert.equal(h.state.canvasGroupFrames.g.x + h.state.canvasGroupFrames.g.w, 296);
  assert.equal(h.context.drag.blockedGroups.size, 0);
});

// ── 非编组节点不回归 ────────────────────────────────────────────────────────

test('未编组的多选拖动仍按原逻辑逐节点吸附', () => {
  const state = baseState({ snap: true });
  state.nodes = [
    { id: 'u1', type: 'text', text: 'U1', x: 0, y: 0, w: 100, h: 80 },
    { id: 'u2', type: 'text', text: 'U2', x: 13, y: 7, w: 100, h: 80 },
  ];
  state.selected = new Set(['u1', 'u2']);
  const context = loadDragHandlers(makeContext(state));
  const emit = (name, point) => {
    const event = {
      button: 0, shiftKey: false, target: makeTarget('node', 'u1'),
      clientX: state.view.x + point.x, clientY: state.view.y + point.y,
      preventDefault() {},
    };
    (name === 'mousedown' ? context.__viewportListeners[name] : context.__listeners[name])(event);
  };
  emit('mousedown', { x: 0, y: 0 });
  assert.equal(context.drag.type, 'nodes');
  assert.deepEqual([...state.selected], ['u1', 'u2']);
  emit('mousemove', { x: 20, y: 0 });
  // 逐节点吸附：u1 到 40，u2 由 33 吸附到 40（不是共享位移后的 53）
  assert.equal(state.nodes[0].x, 40);
  assert.equal(state.nodes[1].x, 40);
});

test('未编组节点之间没有碰撞约束，可直接重叠', () => {
  const state = baseState();
  state.nodes = [
    { id: 'u1', type: 'text', text: 'U1', x: 0, y: 0, w: 100, h: 80 },
    { id: 'u2', type: 'text', text: 'U2', x: 100, y: 0, w: 100, h: 80 },
  ];
  state.selected = new Set(['u1']);
  const context = loadDragHandlers(makeContext(state));
  const emitMove = point => {
    const event = {
      button: 0, shiftKey: false, target: makeTarget('node', 'u1'),
      clientX: state.view.x + point.x, clientY: state.view.y + point.y,
      preventDefault() {},
    };
    context.__listeners.mousemove(event);
  };
  context.__viewportListeners.mousedown({
    button: 0, shiftKey: false, target: makeTarget('node', 'u1'),
    clientX: state.view.x, clientY: state.view.y, preventDefault() {},
  });
  emitMove({ x: 60, y: 0 });
  assert.equal(state.nodes[0].x, 60);
  assert.equal(context.drag.blockedGroups?.size ?? 0, 0);
});

// ── 复制 / 粘贴 / 删除 ──────────────────────────────────────────────────────

function loadClipboardLogic(context) {
  loadGroupLogic(context);
  // 合并后 copySelection 走 async 原生剪贴板写入:桩掉浏览器剪贴板面,只验证 state.clipboard 载荷
  context.navigator = { clipboard: { write: async () => {} } };
  context.ClipboardItem = class {};
  context.Blob = class {};
  context.structuredClone = value => JSON.parse(JSON.stringify(value));
  context.encodeCanvasflowNodesHtml = () => 'data:text/html';
  context.materializeNodeAssetsForPortableSave = async () => {};
  context.desktop = null; // 走浏览器分支,跳过桌面素材物化
  context.walkNodes = (nodes, fn) => {
    for (const node of nodes || []) {
      fn(node);
      if (Array.isArray(node.items)) context.walkNodes(node.items, fn);
      if (Array.isArray(node.subgraph?.nodes)) context.walkNodes(node.subgraph.nodes, fn);
    }
  };
  vm.runInNewContext(STRIP_CODE, context);
  vm.runInNewContext(COPY_CODE, context);
  vm.runInNewContext(REKEY_CODE, context);
  vm.runInNewContext(PASTE_CODE, context);
  return context;
}

test('复制单个成员不会带走整组外框', async () => {
  const state = baseState();
  const context = loadClipboardLogic(makeContext(state));
  context.canvasGroupBounds(state.nodes.slice(0, 2));
  state.selected = new Set(['a']);
  await context.copySelection(false);
  assert.deepEqual(state.clipboard.nodes.map(node => node.id), ['a']);
  assert.deepEqual(plain(state.clipboard.canvasGroupFrames), {});
});

test('粘贴整组会换新组 ID，外框随位移偏移且不影响原组', async () => {
  const state = baseState();
  const context = loadClipboardLogic(makeContext(state, {
    findFreeNodePosition: (x, y) => ({ x, y }),
    walkNodes() {},
    nodeHeightForType: () => 160,
    nextScreenshotNodeSequence: () => 1,
    CanvasFlowImageAnnotations: { read: () => [], write() {} },
  }));
  context.canvasGroupBounds(state.nodes.slice(0, 2));
  state.selected = new Set(['a', 'b']);
  await context.copySelection(false);
  const bounds = frameOf(state);
  context.pasteNodes(state.clipboard, { x: 700, y: 800 });
  const pasted = state.nodes.slice(3);
  const groupId = pasted[0].canvasGroupId;
  assert.ok(groupId && groupId !== 'g');
  assert.equal(pasted[1].canvasGroupId, groupId);
  assert.equal(pasted[0].w, 100);
  assert.equal(pasted[1].w, 120);
  const dx = pasted[0].x - state.nodes[0].x;
  const dy = pasted[0].y - state.nodes[0].y;
  assert.deepEqual(frameOf(state, groupId), { ...bounds, x: bounds.x + dx, y: bounds.y + dy });
  assert.deepEqual(frameOf(state, 'g'), bounds);
  assert.equal(state.selectedCanvasGroupId, groupId);
});

test('编组名称随复制粘贴换新组 ID 传递，原组名保留', async () => {
  const state = baseState();
  const context = loadClipboardLogic(makeContext(state, {
    findFreeNodePosition: (x, y) => ({ x, y }),
    walkNodes() {},
    nodeHeightForType: () => 160,
    nextScreenshotNodeSequence: () => 1,
    CanvasFlowImageAnnotations: { read: () => [], write() {} },
  }));
  context.canvasGroupBounds(state.nodes.slice(0, 2));
  state.canvasGroupNames.g = '角色A';
  state.selected = new Set(['a', 'b']);
  await context.copySelection(false);
  assert.deepEqual(plain(state.clipboard.canvasGroupNames), { g: '角色A' });
  context.pasteNodes(state.clipboard, { x: 700, y: 800 });
  const pasted = state.nodes.slice(3);
  const groupId = pasted[0].canvasGroupId;
  assert.ok(groupId && groupId !== 'g');
  assert.equal(state.canvasGroupNames[groupId], '角色A');
  assert.equal(state.canvasGroupNames.g, '角色A');
});

test('重命名编组：确认写入、留空清除、取消不动', async () => {
  const state = baseState();
  state.canvasGroupNames.g = '旧名';
  const context = loadGroupLogic(makeContext(state));
  const inputListeners = [];
  context.document = {
    addEventListener: (type, fn) => { if (type === 'input') inputListeners.push(fn); },
    removeEventListener() {},
    querySelector: () => null,
  };
  context.escapeHtml = value => String(value);
  context.setTimeout = () => {};
  context.showCanvasDialog = async () => {
    inputListeners.forEach(fn => fn({ target: { matches: selector => selector === '.group-rename-input', value: '新名' } }));
    return true;
  };
  await context.renameCanvasGroup('g');
  assert.equal(state.canvasGroupNames.g, '新名');
  context.showCanvasDialog = async () => {
    inputListeners.forEach(fn => fn({ target: { matches: selector => selector === '.group-rename-input', value: '' } }));
    return true;
  };
  await context.renameCanvasGroup('g');
  assert.equal(state.canvasGroupNames.g, undefined);
  context.showCanvasDialog = async () => false;
  await context.renameCanvasGroup('g');
  assert.equal(state.canvasGroupNames.g, undefined);
});

test('删除单个成员后剩余节点自动退出编组，外框被清理', () => {
  const state = baseState();
  const context = makeContext(state);
  loadGroupLogic(context);
  vm.runInNewContext(DELETE_CODE, context);
  context.canvasGroupBounds(state.nodes.slice(0, 2));
  state.selected = new Set(['a']);
  context.deleteNodes(state.selected);
  assert.deepEqual(state.nodes.map(node => node.id), ['b', 'c']);
  assert.equal(state.nodes[0].canvasGroupId, undefined);
  assert.deepEqual(plain(state.canvasGroupFrames), {});
  assert.equal(state.selectedCanvasGroupId, '');
});

// ── 存档兼容 ────────────────────────────────────────────────────────────────

test('编组与外框可随工程存档往返，旧工程按成员范围推导外框', () => {
  const state = baseState();
  const context = makeContext(state);
  loadGroupLogic(context);
  vm.runInNewContext(CLONE_CODE, context);

  state.nodes[0].x = -150;
  state.nodes[0].y = -150;
  state.canvasGroupNames.g = '角色A';
  context.canvasGroupBounds(state.nodes.slice(0, 2));
  const saved = context.cloneData();
  assert.deepEqual(plain(saved.canvasGroupFrames.g), frameOf(state));
  assert.equal(saved.canvasGroupNames.g, '角色A');
  assert.equal(saved.nodes.length, 3);

  const reload = baseState({});
  const reloadContext = makeContext(reload);
  loadGroupLogic(reloadContext);

  reloadContext.data = saved;
  vm.runInNewContext(RESTORE_CODE, reloadContext);
  assert.deepEqual(plain(reload.canvasGroupFrames), plain(saved.canvasGroupFrames));
  assert.equal(reload.canvasGroupNames.g, '角色A');
  assert.equal(reload.selectedCanvasGroupId, '');

  // 旧工程：完全没有 canvasGroupFrames 字段
  reloadContext.data = { nodes: saved.nodes };
  vm.runInNewContext(RESTORE_CODE, reloadContext);
  assert.deepEqual(plain(reload.canvasGroupFrames), {});
  assert.deepEqual(plain(reload.canvasGroupNames), {});
  const derived = reloadContext.canvasGroupBounds(reload.nodes.slice(0, 2));
  assert.ok(derived.w > 0 && derived.h > 0);
  assert.deepEqual(plain(reload.canvasGroupFrames.g), plain(derived));
});

test('编组数据不触碰连线与批注字段', () => {
  const state = baseState();
  state.edges = [{ id: 'e1', from: { node: 'a', port: 'out' }, to: { node: 'c', port: 'in' }, label: '引用' }];
  state.annotations = [{ id: 'note', text: '批注', x: 1, y: 2 }];
  const context = loadGroupLogic(makeContext(state));
  state.selected = new Set(['a', 'b']);
  context.groupCanvasSelection();
  assert.deepEqual(plain(state.edges), [{ id: 'e1', from: { node: 'a', port: 'out' }, to: { node: 'c', port: 'in' }, label: '引用' }]);
  assert.deepEqual(plain(state.annotations), [{ id: 'note', text: '批注', x: 1, y: 2 }]);
  context.ungroupCanvasSelection();
  assert.deepEqual(plain(state.edges).length, 1);
  assert.deepEqual(plain(state.annotations).length, 1);
});
