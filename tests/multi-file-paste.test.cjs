// 多选文件粘贴画布：vm 切片 createNodeFromClipboard 真实源码,用假 DataTransfer 模拟
// 资源管理器多选复制(Chromium 经 items kind="file" 暴露)。锁死四个事实：
// ① 多张图片(含 mime 为空的扩展名图片)全部落画布,网格排布,单次 pushHistory;
// ② 非图片文件被过滤,不产生节点;
// ③ 单张仍走原单节点路径;
// ④ 纯文本仍创建文字节点;粘贴外层 hasExternalContent 认识 data.files。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

const SLICE_START = 'async function createNodeFromClipboard(';
const SLICE_END = '\nasync function copyTextValue';

function buildHarness() {
  const start = source.indexOf(SLICE_START);
  assert.ok(start > 0, 'slice start marker not found');
  const end = source.indexOf(SLICE_END, start);
  assert.ok(end > start, 'slice end marker not found');
  const clipSlice = source.slice(start, end);
  const filterStart = source.indexOf('function isSupportedImageFile(');
  const filterSlice = source.slice(filterStart, source.indexOf('\n}', filterStart) + 2);

  const created = [];
  const historyPushes = [];
  const toasts = [];
  const context = {
    isSupportedImageFile: null, // 由 filterSlice 注入
    currentPasteAnchor: () => ({ x: 500, y: 300 }),
    addNode: (type, x, y) => { const node = { type, x, y, id: `n${created.length + 1}` }; created.push(node); return node; },
    fileToDataUrl: async file => `data:${file.type || 'image/png'};base64,${file.name}`,
    externalizeImageField: async () => {},
    pushHistory: () => historyPushes.push(1),
    render: () => {},
    toast: text => toasts.push(text),
    timestamp: () => '0',
    IMAGE_NODE_VERTICAL_STEP: 260,
    NODE_WIDTH: 220,
    NODE_HEIGHT: 160,
  };
  vm.createContext(context);
  vm.runInContext(filterSlice, context);
  context.isSupportedImageFile = context.isSupportedImageFile || vm.runInContext('isSupportedImageFile', context);
  const run = vm.runInContext(`(${clipSlice})`, context);
  return { run, created, historyPushes, toasts };
}

const fakeFile = (name, type) => ({ name, type, kind: 'file' });
const fakeClipboard = items => ({ items: items.map(file => ({ kind: 'file', type: file.type || '', getAsFile: () => file })), files: items, getData: () => '' });

test('文件夹多选 4 张图(mime 为空也算)粘贴:4 个节点 4 列网格排布,单次历史', async () => {
  const { run, created, historyPushes, toasts } = buildHarness();
  const ev = { clipboardData: fakeClipboard([
    fakeFile('a.png', 'image/png'),
    fakeFile('b.jpg', ''), // 资源管理器复制的文件 type 常为空串,靠扩展名命中
    fakeFile('c.webp', 'image/webp'),
    fakeFile('d.gif', 'image/gif'),
  ]) };
  const ok = await run(ev);
  assert.equal(ok, true);
  assert.equal(created.length, 4, '多选图片必须全部落画布');
  assert.deepEqual(created.map(node => node.fileName), ['a.png', 'b.jpg', 'c.webp', 'd.gif']);
  // 4 张 → 4 列,同一行:col*280 排布,锚点 (500,300)
  assert.deepEqual(created.map(node => node.x), [500, 780, 1060, 1340]);
  assert.ok(created.every(node => node.y === 300), '单行网格 y 不变');
  assert.equal(historyPushes.length, 1, '批量粘贴只推一次历史');
  assert.match(toasts[0], /已从剪贴板创建 4 个图片节点/);
});

test('超过 4 张折行:第 5 张落到第二行;非图片文件被过滤', async () => {
  const { run, created } = buildHarness();
  const ev = { clipboardData: fakeClipboard([
    fakeFile('1.png', 'image/png'),
    fakeFile('2.png', ''),
    fakeFile('3.png', 'image/png'),
    fakeFile('4.png', 'image/png'),
    fakeFile('5.png', 'image/png'),
    fakeFile('notes.txt', 'text/plain'), // 非图片,不得产生节点
  ]) };
  const ok = await run(ev);
  assert.equal(ok, true);
  assert.equal(created.length, 5, '5 张图片落画布,txt 被过滤');
  assert.deepEqual(created.map(node => node.fileName), ['1.png', '2.png', '3.png', '4.png', '5.png']);
  assert.equal(created[4].x, 500, '第 5 张回到第 0 列');
  assert.equal(created[4].y, 560, '第 5 张落到第二行(300+260)');
});

test('单张粘贴保持原单节点路径;纯文本仍创建文字节点', async () => {
  const { run, created, historyPushes } = buildHarness();
  const single = { clipboardData: fakeClipboard([fakeFile('only.png', 'image/png')]) };
  assert.equal(await run(single), true);
  assert.equal(created.length, 1);
  assert.equal(created[0].x, 500);
  assert.equal(historyPushes.length, 1);

  const text = { clipboardData: { items: [], files: [], getData: type => type === 'text/plain' ? '普通文字内容' : '' } };
  const textHarness = buildHarness();
  assert.equal(await textHarness.run(text), true);
  assert.equal(textHarness.created.length, 1);
  assert.equal(textHarness.created[0].type, 'text');
  assert.equal(textHarness.created[0].text, '普通文字内容');
});

test('静态接线:粘贴入口认识 data.files,旧的单张 items.find 模式不得回流', () => {
  assert.match(source, /\(data\.files && data\.files\.length > 0\)/, 'hasExternalContent 必须包含 data.files 判定');
  assert.doesNotMatch(source.slice(source.indexOf(SLICE_START), source.indexOf(SLICE_END)), /items\.find\(item => item\.kind === "file"/, '不得退回只取第一张的 items.find 模式');
});
