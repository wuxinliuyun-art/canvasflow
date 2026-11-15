const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('app.js');

test('editor generator defaults to collapsed while canvas palette nodes remain expanded', () => {
  const start = source.indexOf('function paletteMarkup(');
  const end = source.indexOf('function renderEditorPalette(', start);
  const widget = { layout: 'strip', selected: '#FF0000', generatorOpen: false };
  const context = {
    paletteFor: () => null, paletteWidget: () => widget, escapeHtml: value => value,
    globalLibrary: { palettes: [] }, widgetOptions: () => '', paletteFamilies: {}, paletteLevels: {},
    widgetResults: () => 'results', widgetInspector: () => 'details'
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.markup = paletteMarkup;`, context);
  const closed = context.markup();
  assert.match(closed, /<details class="palette-editor-generator" >/);
  assert.ok(closed.indexOf('<details') < closed.indexOf('palette-widget-filters'));
  assert.ok(closed.indexOf('palette-widget-details') < closed.indexOf('</details>'));
  widget.generatorOpen = true;
  assert.match(context.markup(), /<details class="palette-editor-generator" open>/);
  assert.doesNotMatch(context.markup({ id: 'palette-node' }), /<details/);
  assert.match(source, /paletteWidget\("editor"\)\.generatorOpen = false/);
});

test('free color brush relocates the actual shared controls into its local panel and restores them on tool switches', () => {
  const start = source.indexOf('  const isFill = lightboxPaintMode === "fill";', source.indexOf('function setLightboxPaintMode'));
  const end = source.indexOf('  els.lightboxPaintFill.setAttribute', start);
  const container = () => ({ hidden: false, classList: { toggle() {} }, append(child) { child.parentElement = this; }, prepend(child) { child.parentElement = this; } });
  const bottom = container(), fill = container(), brush = container();
  const color = { parentElement: bottom }, size = { parentElement: bottom };
  const context = { lightboxPaintMode: 'color-brush', $: id => id === 'lightboxToolColor' ? fill : brush, els: { lightboxPaintColorField: color, lightboxPaintSizeField: size, lightboxPaintOptions: bottom } };
  const run = () => vm.runInNewContext(`(() => { ${source.slice(start,end)} })()`, context);
  run(); assert.equal(color.parentElement, brush); assert.equal(size.parentElement, brush);
  context.lightboxPaintMode = 'fill'; run(); assert.equal(color.parentElement, fill); assert.equal(size.parentElement, bottom);
  context.lightboxPaintMode = 'brush'; run(); assert.equal(color.parentElement, bottom); assert.equal(size.parentElement, bottom);
  assert.match(read('index.html'), /id="lightboxColorBrushOptions"[^>]*aria-label="自由上色笔刷设置"/);
});
