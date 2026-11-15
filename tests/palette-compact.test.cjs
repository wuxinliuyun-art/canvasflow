const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read('app.js').replace(/\r\n/g, '\n');

test('palette header contains the title and mode controls without collapse behavior', () => {
  assert.doesNotMatch(read('index.html'), /editorPaletteToggle/);
  assert.doesNotMatch(source, /editorPaletteToggle/);
  const markup = source.slice(source.indexOf('function paletteMarkup('), source.indexOf('function renderEditorPalette('));
  assert.match(markup, /<header class="palette-widget-header">[\s\S]*palette-widget-title[\s\S]*palette-widget-layouts/);
});

test('color details omit HEX and preserve correct RGB / CMYK values including pure black', () => {
  const start = source.indexOf('function widgetInspector(');
  const end = source.indexOf('function updatePaletteWidget(', start);
  const context = { escapeHtml: value => value };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.inspect = widgetInspector;`, context);
  const red = context.inspect('#FF0000');
  assert.doesNotMatch(red, /HEX/);
  assert.match(red, /data-copy-value="255,0,0"/);
  assert.match(red, /data-copy-value="0,100,100,0"/);
  assert.match(context.inspect('#000000'), /data-copy-value="0,0,0,100"/);
  assert.match(context.inspect('#FFFFFF'), /data-copy-value="0,0,0,0"/);
});

test('right clicking a color suppresses the native menu and copies only that HEX', async () => {
  const start = source.indexOf('document.addEventListener("contextmenu", event => {\n  const button = event.target.closest(\'.palette-widget button[data-color]\');');
  assert.ok(start >= 0);
  const end = source.indexOf('document.getElementById("editorPalette").addEventListener("dragstart"', start);
  let handler;
  const copied = [];
  vm.runInNewContext(source.slice(start, end), {
    document: { addEventListener: (name, callback, capture) => { assert.equal(name, 'contextmenu'); assert.equal(capture, true); handler = callback; } },
    copyTextValue: async value => { copied.push(value); return true; },
    toast: () => {}
  });
  let prevented = false;
  handler({ target: { closest: () => ({ dataset: { color: '#AABBCC' } }) }, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => {} });
  await Promise.resolve();
  assert.equal(prevented, true);
  assert.deepEqual(copied, ['#AABBCC']);
  handler({ target: { closest: () => null } });
  assert.equal(copied.length, 1);
});

test('details stay in two columns and strips use reduced heights', () => {
  const css = read('styles.css');
  assert.match(css, /\.palette-widget-inspector \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /\[data-layout="strip"\] button \{ height: 88px/);
  assert.match(css, /\[data-palette-action="pick"\] \{ width: 100%; height: 64px/);
});

test('scheme selector is a name input + arrow menu combo, not a bare dropdown', () => {
  const markup = source.slice(source.indexOf('function paletteMarkup('), source.indexOf('function renderEditorPalette('));
  // 名称框：点击即编辑，无方案时只读占位
  assert.match(markup, /class="palette-scheme-combo"/);
  assert.match(markup, /class="palette-scheme-name"[^>]*readonly/);
  assert.doesNotMatch(markup, /palette-scheme-select/);
  assert.match(markup, /data-palette-action="scheme-menu"/);
  assert.doesNotMatch(markup, /scheme-pick" data-id=""/);
  assert.doesNotMatch(markup, /__rename__/);
  // 改名提交走 change（重名回退），弹窗改名函数已删除
  assert.match(source, /已存在同名方案「\$\{name\}」，请换一个名称`\); input\.value = palette\.name/);
  assert.doesNotMatch(source, /async function renamePaletteDialog/);
  // 箭头开关与其他实例菜单互斥；外部点击/Esc 关闭
  assert.match(source, /case "scheme-menu"/);
  assert.match(source, /case "scheme-pick"/);
  assert.match(source, /\.palette-scheme-menu:not\(\.hidden\)/);
});
