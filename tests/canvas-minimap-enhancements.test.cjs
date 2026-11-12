const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const css = fs.readFileSync(require.resolve('../styles.css'), 'utf8');

// CSS 显示尺寸取画布属性尺寸的 2 倍，专门检验属性/显示尺寸解耦换算
const MINIMAP_RECT = { left: 0, top: 0, width: 300, height: 192 };
const VIEWPORT_RECT = { left: 0, top: 0, width: 900, height: 600 };

function makeMinimapEl() {
  const listeners = {};
  const focused = [];
  return {
    width: 150, height: 96,
    getBoundingClientRect: () => ({ ...MINIMAP_RECT }),
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
    focus: (opts) => focused.push(opts === undefined ? null : { ...opts }),
    __listeners: listeners,
    __focused: focused,
  };
}

function contentBoundsFor(nodes) {
  if (!nodes.length) return { x: 0, y: 0, w: 1000, h: 700 };
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const xe = nodes.map(n => n.x + n.w), ye = nodes.map(n => n.y + n.h);
  const x = Math.min(...xs) - 100, y = Math.min(...ys) - 100;
  return { x, y, w: Math.max(...xe) - x + 100, h: Math.max(...ye) - y + 100 };
}

// 切出增强块：从增强标记到 contentBounds 定义
function runEnhancementContext({ nodes = [], view = { x: 0, y: 0, scale: 1 }, selected = new Set() } = {}) {
  const start = source.indexOf('// ===== 小地图增强：点击选中命中节点 + Enter/Space 键盘导航 =====');
  assert.ok(start >= 0, 'enhancement block marker not found');
  const end = source.indexOf('function contentBounds() {', start);
  assert.ok(end > start, 'end marker not found');
  const applied = [], painted = [], persisted = [], synced = [];
  const minimapEl = makeMinimapEl();
  const state = { nodes, edges: [], selected, view: { ...view } };
  const context = {
    state,
    els: {
      minimap: minimapEl,
      viewport: { getBoundingClientRect: () => ({ ...VIEWPORT_RECT }) },
    },
    contentBounds: () => contentBoundsFor(nodes),
    applyView: () => applied.push({ ...state.view }),
    renderMinimap: () => painted.push(1),
    scheduleViewPersistence: () => persisted.push(1),
    syncSelectedNodeClasses: () => synced.push(1),
  };
  vm.runInNewContext(source.slice(start, end), context);
  const fire = (name, event) => context.els.minimap.__listeners[name].forEach(fn => fn(event));
  return { context, state, fire, applied, painted, persisted, synced, focused: minimapEl.__focused };
}

// 通过世界坐标反推小地图上的 client 坐标
function clientFor(ctx, worldX, worldY) {
  const p = ctx.context.minimapProjection(ctx.context.contentBounds(), 150, 96);
  const canvasX = worldX * p.scale + p.ox, canvasY = worldY * p.scale + p.oy;
  return { clientX: canvasX * MINIMAP_RECT.width / 150, clientY: canvasY * MINIMAP_RECT.height / 96 };
}

// ===== 投影与命中 =====

test('projection keeps 5px padding, tighter-axis scale and stays finite on extremes', () => {
  const { context } = runEnhancementContext();
  const p = context.minimapProjection({ x: 0, y: 0, w: 800, h: 600 }, 150, 96);
  assert.ok(Math.abs(p.scale - (96 - 10) / 600) < 1e-9);
  assert.equal(p.ox, 5);
  for (const bounds of [{ x: -5000, y: -8000, w: 12000, h: 20000 }, { x: -1e6, y: -1e6, w: 2e6, h: 2e6 }, { x: 0, y: 0, w: 1000, h: 700 }]) {
    const q = context.minimapProjection(bounds, 150, 96);
    assert.ok(Number.isFinite(q.scale) && q.scale > 0 && Number.isFinite(q.ox) && Number.isFinite(q.oy));
  }
});

test('node hit testing honors 4px tolerance, topmost-wins and finds group nodes', () => {
  const { context } = runEnhancementContext();
  const nodes = [
    { id: 'a', x: -300, y: -200, w: 80, h: 60, type: 'image' },
    { id: 'g', x: 0, y: 0, w: 200, h: 120, type: 'group' },
    { id: 'b', x: 50, y: 40, w: 100, h: 100, type: 'image' }, // 与 g 重叠、数组更后 = 视觉更上层
  ];
  const p = context.minimapProjection({ x: -400, y: -300, w: 900, h: 700 }, 150, 96);
  const center = (n) => ({ x: (n.x + n.w / 2) * p.scale + p.ox, y: (n.y + n.h / 2) * p.scale + p.oy });
  assert.equal(context.minimapNodeAtPoint(nodes, center(nodes[0]), p)?.id, 'a'); // 负坐标可命中
  assert.equal(context.minimapNodeAtPoint(nodes, center(nodes[2]), p)?.id, 'b'); // 与组重叠时上层节点优先
  const groupPoint = { x: 10 * p.scale + p.ox, y: 60 * p.scale + p.oy }; // 组内、b 容差外
  assert.equal(context.minimapNodeAtPoint(nodes, groupPoint, p)?.id, 'g'); // 组节点可命中
  const bc = center(nodes[2]);
  assert.equal(context.minimapNodeAtPoint(nodes, { x: bc.x, y: bc.y + 7 }, p)?.id, 'b'); // 4px 容差内
  assert.equal(context.minimapNodeAtPoint(nodes, { x: bc.x, y: bc.y + 11 }, p), null); // 容差外
  assert.equal(context.minimapNodeAtPoint(nodes, { x: -1e6, y: -1e6 }, p), null);
});

// ===== 点击选中（松开判定，不影响按下即导航的上游手感） =====

test('plain click on a node block selects it without touching blank clicks', () => {
  const nodes = [{ id: 'a', x: 400, y: 300, w: 240, h: 160, type: 'image' }];
  const ctx = runEnhancementContext({ nodes });
  ctx.state.selected = new Set(['other']);
  const at = clientFor(ctx, nodes[0].x + 120, nodes[0].y + 80);
  ctx.fire('pointerdown', { button: 0, pointerId: 1, ...at });
  ctx.fire('pointerup', { pointerId: 1, ...at });
  assert.deepEqual([...ctx.state.selected], ['a']);
  assert.equal(ctx.synced.length, 1);

  // 空白点击：选区保持不变（上游仅导航语义不受影响）
  const blank = clientFor(ctx, -5000, -5000);
  ctx.fire('pointerdown', { button: 0, pointerId: 2, ...blank });
  ctx.fire('pointerup', { pointerId: 2, ...blank });
  assert.deepEqual([...ctx.state.selected], ['a']);
});

test('drag (>=4px) or pointer id mismatch never selects; candidate is cleared after pointerup', () => {
  const nodes = [{ id: 'a', x: 400, y: 300, w: 240, h: 160, type: 'image' }];
  const ctx = runEnhancementContext({ nodes });
  const at = clientFor(ctx, nodes[0].x + 120, nodes[0].y + 80);
  ctx.fire('pointerdown', { button: 0, pointerId: 1, ...at });
  ctx.fire('pointermove', { pointerId: 1, clientX: at.clientX + 5, clientY: at.clientY });
  ctx.fire('pointerup', { pointerId: 1, clientX: at.clientX + 5, clientY: at.clientY });
  assert.deepEqual([...ctx.state.selected], []);

  // 位移 <4px 属于点击：仍然选中
  ctx.fire('pointerdown', { button: 0, pointerId: 2, ...at });
  ctx.fire('pointermove', { pointerId: 2, clientX: at.clientX + 3, clientY: at.clientY });
  ctx.fire('pointerup', { pointerId: 2, clientX: at.clientX + 3, clientY: at.clientY });
  assert.deepEqual([...ctx.state.selected], ['a']);

  // pointerup 后候选已清除：同 pointerId 的再次 pointerup 不重复选中
  ctx.state.selected = new Set();
  ctx.fire('pointerup', { pointerId: 2, clientX: at.clientX, clientY: at.clientY });
  assert.deepEqual([...ctx.state.selected], []);

  // pointerId 不匹配不选中
  ctx.fire('pointerdown', { button: 0, pointerId: 3, ...at });
  ctx.fire('pointerup', { pointerId: 9, ...at });
  assert.deepEqual([...ctx.state.selected], []);
});

test('right-button press never starts a selection candidate', () => {
  const ctx = runEnhancementContext({ nodes: [{ id: 'a', x: 0, y: 0, w: 100, h: 80, type: 'image' }] });
  ctx.fire('pointerdown', { button: 2, pointerId: 1, clientX: 50, clientY: 40 });
  ctx.fire('pointerup', { pointerId: 1, clientX: 50, clientY: 40 });
  assert.deepEqual([...ctx.state.selected], []);
});

// ===== 键盘导航 =====

test('Enter or Space centers the view on the selected node', () => {
  const nodes = [{ id: 'a', x: 400, y: 300, w: 240, h: 160, type: 'image' }];
  const ctx = runEnhancementContext({ nodes, view: { x: 0, y: 0, scale: 2 }, selected: new Set(['a']) });
  const prevented = [];
  ctx.fire('keydown', { key: 'Enter', preventDefault: () => prevented.push('Enter') });
  assert.deepEqual(prevented, ['Enter']);
  assert.ok(Math.abs(ctx.state.view.x - (450 - 520 * 2)) < 1e-6);
  assert.ok(Math.abs(ctx.state.view.y - (300 - 380 * 2)) < 1e-6);
  assert.equal(ctx.painted.length, 1); // 视口框随导航重绘
  assert.equal(ctx.persisted.length, 1);
  ctx.fire('keydown', { key: ' ', preventDefault: () => prevented.push('Space') });
  assert.deepEqual(prevented, ['Enter', 'Space']);
  assert.equal(ctx.persisted.length, 2);
});

test('keyboard navigation with empty selection centers content bounds; other keys ignored', () => {
  const ctx = runEnhancementContext({ view: { x: 500, y: 400, scale: 1.5 } });
  ctx.fire('keydown', { key: 'Enter', preventDefault() {} });
  assert.ok(Math.abs(ctx.state.view.x - (450 - 500 * 1.5)) < 1e-6);
  assert.ok(Math.abs(ctx.state.view.y - (300 - 350 * 1.5)) < 1e-6);
  const before = { ...ctx.state.view };
  ctx.fire('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.deepEqual(ctx.state.view, before);
});

// ===== PR4-KBD-01 回归：点击聚焦（真实缺陷：上游 preventDefault 取消原生点击聚焦） =====

test('pointerdown acquires keyboard focus even though upstream preventDefault cancels native click-focus', () => {
  const nodes = [{ id: 'a', x: 400, y: 300, w: 240, h: 160, type: 'image' }];
  const ctx = runEnhancementContext({ nodes });
  const at = clientFor(ctx, nodes[0].x + 120, nodes[0].y + 80);
  ctx.fire('pointerdown', { button: 0, pointerId: 1, preventDefault() {}, ...at });
  assert.deepEqual(ctx.focused, [{ preventScroll: true }]);

  // 非主键按下不聚焦（与选中候选同一个 button 守卫）
  ctx.fire('pointerdown', { button: 2, pointerId: 2, preventDefault() {}, ...at });
  assert.equal(ctx.focused.length, 1);

  // 上游“按下即导航 + preventDefault”语义必须原样保留——修复正是靠编程式 focus() 绕过它
  const upstream = source.slice(source.indexOf('let minimapNavigationPointer = null;'), source.indexOf('// ===== 小地图增强'));
  assert.ok(upstream.includes('event.preventDefault();'), 'upstream pointerdown preventDefault must stay: fix relies on programmatic focus()');
});

test('keyboard listeners bind only to the minimap element, never document-wide', () => {
  const { context } = runEnhancementContext();
  const keydown = context.els.minimap.__listeners.keydown;
  assert.ok(Array.isArray(keydown) && keydown.length === 1, 'exactly one keydown handler on the minimap element');
  const start = source.indexOf('// ===== 小地图增强');
  const block = source.slice(start, source.indexOf('function contentBounds() {', start));
  assert.ok(!block.includes('document.addEventListener'), 'keyboard nav must not hook document-level keydown');
  assert.ok(!block.includes('window.addEventListener'), 'keyboard nav must not hook window-level keydown');
});

test('keyboard navigation and mouse selection work in sequence without interference', () => {
  const nodes = [{ id: 'a', x: 400, y: 300, w: 240, h: 160, type: 'image' }];
  const ctx = runEnhancementContext({ nodes, view: { x: 0, y: 0, scale: 1 } });
  const at = clientFor(ctx, nodes[0].x + 120, nodes[0].y + 80);
  ctx.fire('pointerdown', { button: 0, pointerId: 1, ...at });
  ctx.fire('pointerup', { pointerId: 1, ...at });
  assert.deepEqual([...ctx.state.selected], ['a']); // 点击选中不受聚焦改动影响

  ctx.fire('keydown', { key: 'Enter', preventDefault() {} });
  assert.ok(Math.abs(ctx.state.view.x - (450 - 520)) < 1e-6); // 视口中心 450,300；节点中心 520,380
  assert.ok(Math.abs(ctx.state.view.y - (300 - 380)) < 1e-6);

  const viewBefore = { ...ctx.state.view };
  ctx.fire('keydown', { key: 'Tab', preventDefault() {} });
  assert.deepEqual([...ctx.state.selected], ['a']); // 无关按键不动选区
  assert.deepEqual(ctx.state.view, viewBefore);     // 无关按键不导航
  assert.equal(ctx.persisted.length, 1);            // 仅 Enter 触发一次持久化
});

// ===== 上游导航手感与界面资产保护 =====

test('upstream pointer navigation stays intact: press navigates immediately with capture', () => {
  const block = source.slice(source.indexOf('let minimapNavigationPointer = null;'), source.indexOf('// ===== 小地图增强'));
  assert.ok(block.includes('setPointerCapture(event.pointerId)'), 'upstream capture must remain');
  assert.ok(block.includes('navigateFromMinimap(event)'), 'press must still navigate immediately');
  assert.ok(block.includes('pointercancel'), 'upstream cancel handling must remain');
  // 增强块自身的 pointerdown 不调用 preventDefault/stopPropagation，避免改变上游手感
  const start = source.indexOf('// ===== 小地图增强');
  const block2 = source.slice(start, source.indexOf('function contentBounds() {', start));
  assert.equal((block2.match(/addEventListener\("pointerdown"/g) || []).length, 1);
});

test('minimap canvas gains accessible semantics and asset versions are bumped', () => {
  const canvas = html.match(/<canvas id="minimap"[^>]*>/);
  assert.ok(canvas, 'minimap canvas must exist');
  assert.ok(canvas[0].includes('role="button"'), 'keyboard navigation needs role="button"');
  assert.ok(canvas[0].includes('tabindex="0"'), 'keyboard navigation needs tabindex');
  assert.ok(canvas[0].includes('aria-label='), 'canvas must keep an accessible label');
  assert.ok(html.includes('app.js?v=20261113-resultedge1'), 'app.js version must be bumped');
  assert.ok(html.includes('styles.css?v=20261113-resultedge1'), 'styles.css version must be bumped');
});

test('focus ring uses the primary token with no bare colors', () => {
  const start = css.indexOf('.minimap:focus-visible');
  assert.ok(start > 0, 'focus-visible rule must exist');
  const rule = css.slice(start, css.indexOf('}', start) + 1);
  assert.ok(rule.includes('var(--primary)'), 'focus ring must use --primary');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(rule), 'no bare colors');
});
