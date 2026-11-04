const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function fixture(saved = null) {
  const nodes = new Map(), storage = new Map(), undo = [], notices = [], timers = new Map();
  let sequence = 0;
  if (saved) storage.set('canvasflow-arrow-annotation-colors', saved);
  function element() {
    const classes = new Set(['hidden']);
    return {
      children: [], style: {}, value: '', events: {}, offsetWidth: 280, offsetHeight: 160,
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
        toggle(c, enabled) { if (enabled ?? !classes.has(c)) classes.add(c); else classes.delete(c); } },
      addEventListener(type, handler) { this.events[type] = handler; },
      remove() { this.removed = true; }, focus() {}, blur() {}, setAttribute() {}, contains: () => false, matches: () => false,
      replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); }, prepend(item) { this.children.unshift(item); },
      getBoundingClientRect: () => ({ left: 0, top: 600, width: 800, height: 600 })
    };
  }
  const $ = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const canvas = { width: 800, height: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const c = { $, ARROW_NOTE_ENABLED: true, document: { activeElement: null, createElement: element, createTextNode: text => text },
    window: { innerWidth: 900, innerHeight: 700, addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    els: { lightbox: element(), lightboxPaintCanvas: canvas, lightboxPaintToolbar: element() },
    lightboxPainting: true, lightboxPaintActions: [], lightboxPaintCurrentAction: null,
    lightboxPaintOverlay: { getContext: () => ({ save() {}, restore() {}, measureText: text => ({ width: text.length * 8 }) }) },
    pushLightboxEditUndo: fn => undo.push(fn), rebuildLightboxPaintOverlay() {}, toast: msg => notices.push(msg),
    setTimeout: fn => { const id = ++sequence; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    getComputedStyle: () => ({ fontFamily: 'sans-serif', getPropertyValue: name => name }) };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('const arrowNote ='), source.indexOf('function clearLightboxCrop()')), c);
  return { c, $, undo, notices, timers, storage, canvas, run: code => vm.runInContext(code, c) };
}
function arrow(x = 780, y = 580) {
  return { kind: 'arrow', color: '#ff3b30', points: [{ x: 100, y: 100, scale: 1 }, { x, y }] };
}

test('10 color slots retain existing colors, preserve holes and cap saved entries', () => {
  const f = fixture(JSON.stringify(['#aabbcc', 'bad', null, '#123456', '#ABCDEF', '#000000']));
  assert.equal(f.run('JSON.stringify(arrowSavedColors.slice(0, 5))'), '["#AABBCC",null,null,"#123456","#ABCDEF"]');
  assert.equal(f.run('normalizeArrowColors({}).length'), 10);
  const a = arrow(); f.c.lightboxPaintActions.push(a); f.c.showArrowNote(a);
  f.c.renderArrowColorSlots();
  const slots = () => f.$('lightboxArrowColorSlots').children;
  assert.equal(slots().length, 10);
  assert.equal(slots()[1].children[0].textContent, '+');
  f.$('lightboxArrowColor').value = '#111111';
  slots()[1].children[0].onclick();
  f.$('lightboxArrowColor').value = '#222222';
  slots()[2].children[0].onclick();
  const persisted = JSON.parse(f.storage.get('canvasflow-arrow-annotation-colors'));
  assert.equal(persisted.length, 10); assert.equal(persisted[0], '#AABBCC');
  assert.equal(persisted[1], '#111111'); assert.equal(persisted[2], '#222222');
  // Occupied slots apply their color rather than replacing their saved value.
  slots()[0].children[0].onclick();
  assert.equal(a.noteColor, '#AABBCC');
  assert.equal(f.$('lightboxArrowColor').value, '#AABBCC');
  slots()[0].children[1].onclick();
  assert.equal(JSON.parse(f.storage.get('canvasflow-arrow-annotation-colors'))[0], null);
  assert.equal(slots()[0].children[0].textContent, '+');
  assert.equal(slots()[0].children.length, 1);
  assert.equal(a.noteColor, '#AABBCC');
  f.$('lightboxArrowColor').value = '#123ABC';
  slots()[9].children[0].onclick();
  assert.equal(JSON.parse(f.storage.get('canvasflow-arrow-annotation-colors'))[9], '#123ABC');
  const restored = fixture(f.storage.get('canvasflow-arrow-annotation-colors'));
  assert.equal(restored.run('arrowSavedColors[9]'), '#123ABC');
  assert.equal(f.run('normalizeArrowColors(Array(120).fill("#AABBCC")).length'), 10);
});

test('note edits and palette labels are independent of arrow stroke color and undo separately', () => {
  const f = fixture(); const a = arrow(); f.c.lightboxPaintActions.push(a); f.c.showArrowNote(a);
  const text = f.$('lightboxArrowText'); text.events.focus(); text.value = '主色用于背景'; text.events.input(); text.events.blur();
  f.c.setArrowNoteColor('#12ab34');
  assert.equal(a.noteText, '主色用于背景'); assert.equal(a.noteColor, '#12AB34'); assert.equal(a.color, '#ff3b30');
  f.undo.pop()(); assert.equal(a.noteColor, null); assert.equal(a.noteText, '主色用于背景');
  f.undo.pop()(); assert.equal(a.noteText, '');
});

test('editor auto hides while annotations persist, and stays open during text or color editing', () => {
  const f = fixture(); const a = arrow(); a.noteColor = '#AABBCC';
  f.c.lightboxPaintActions.push(a); f.c.showArrowNote(a);
  const panel = f.$('lightboxArrowNote');
  assert.equal(f.timers.size, 1);
  f.c.document.activeElement = f.$('lightboxArrowText'); f.c.hideArrowNote(); assert(!panel.classList.contains('hidden'));
  f.c.document.activeElement = null; f.$('lightboxArrowColor').events.click(); f.c.hideArrowNote(); assert(!panel.classList.contains('hidden'));
  f.c.finishArrowColorPick(); f.c.hideArrowNote(); assert(panel.classList.contains('hidden'));
  assert.equal(a.noteColor, '#AABBCC'); assert.equal(f.c.lightboxPaintActions.length, 1);
  f.c.showArrowNote(a); assert(!panel.classList.contains('hidden'));
  f.c.lightboxPaintActions.length = 0; f.c.syncArrowNoteHandles(); assert(panel.classList.contains('hidden'));
});

test('export draws wrapped text, swatch and uppercase HEX inside the image edges', () => {
  const f = fixture(), a = arrow(), drawn = [];
  a.noteText = '配色说明'.repeat(20); a.noteColor = '#12AB34';
  const ctx = { save() {}, restore() {}, measureText: text => ({ width: Array.from(text).length * 16 }),
    fillRect: (...args) => drawn.push(['rect', ...args]), strokeRect() {}, fillText: text => drawn.push(['text', text]) };
  const box = f.c.arrowAnnotationLayout(ctx, a);
  assert(box.x >= 0 && box.y >= 0); assert(box.x + box.width <= 800); assert(box.y + box.height <= 600);
  assert(box.lines.length > 1);
  f.c.drawArrowAnnotation(ctx, a);
  assert(drawn.some(item => item[0] === 'text' && item[1] === '#12AB34'));
  assert.equal(drawn.filter(item => item[0] === 'rect').length, 1); // Only the color swatch, no annotation background.
  drawn.length = 0; a.noteColor = null;
  f.c.drawArrowAnnotation(ctx, a);
  assert.equal(drawn.filter(item => item[0] === 'rect').length, 0);
  assert(drawn.some(item => item[0] === 'text'));
  assert.equal(f.c.arrowAnnotationLayout(ctx, arrow()), null);
});

test('change-only native picker updates visible swatch, HEX and undo', () => {
  const f = fixture(), a = arrow(); f.c.lightboxPaintActions.push(a); f.c.showArrowNote(a);
  const picker = f.$('lightboxArrowColor');
  picker.events.click(); picker.value = '#00ff7b'; picker.events.change();
  assert.equal(a.noteColor, '#00FF7B');
  assert.equal(f.$('lightboxArrowPreviewHex').textContent, '#00FF7B');
  assert.equal(f.$('lightboxArrowPreviewSwatch').style.backgroundColor, '#00FF7B');
  assert(!f.$('lightboxArrowColorPreview').classList.contains('hidden'));
  assert.equal(f.undo.length, 1);
  f.undo.pop()(); assert.equal(a.noteColor, null);
});

test('annotation and persistent controls anchor to arrow tail, not arrowhead', () => {
  const f = fixture(), a = arrow(700, 500); a.noteColor = '#00FF7B';
  f.c.lightboxPaintActions.push(a); f.c.showArrowNote(a);
  const context = { measureText: text => ({ width: text.length * 8 }) };
  const box = f.c.arrowAnnotationLayout(context, a);
  assert.equal(box.x, 112); assert.equal(box.y, 112);
  assert.equal(f.$('lightboxArrowNote').style.left, '112px');
  f.c.hideArrowNote(true); f.c.syncArrowNoteHandles();
  assert.equal(f.c.arrowNoteAtClientPoint(100, 100), a);
  assert.equal(f.c.arrowNoteAtClientPoint(150, 130), a);
  assert.equal(f.c.arrowNoteAtClientPoint(700, 500), null);
});

test('existing swatch reopens picker and HEX stays synchronized through repeat edits and undo', () => {
  const f = fixture(), a = arrow(); a.noteColor = '#00FF7B';
  f.c.lightboxPaintActions.push(a); f.c.showArrowNote(a);
  const picker = f.$('lightboxArrowColor'); let opened = 0;
  picker.showPicker = () => { opened++; };
  f.$('lightboxArrowColorPreview').onclick();
  assert.equal(opened, 1); assert.equal(picker.value, '#00FF7B');
  picker.value = '#123456'; picker.events.input(); picker.events.change();
  assert.equal(a.noteColor, '#123456');
  assert.equal(f.$('lightboxArrowPreviewHex').textContent, '#123456');
  assert.equal(f.$('lightboxArrowHex').textContent, '#123456');
  f.$('lightboxArrowColorPreview').onclick();
  picker.value = '#abcdef'; picker.events.change();
  assert.equal(a.noteColor, '#ABCDEF');
  assert.equal(f.$('lightboxArrowPreviewHex').textContent, '#ABCDEF');
  f.undo.pop()(); f.c.syncArrowNoteHandles();
  assert.equal(picker.value, '#123456');
  assert.equal(f.$('lightboxArrowPreviewHex').textContent, '#123456');
  assert.equal(f.$('lightboxArrowHex').textContent, '#123456');
});

test('tail hover hit testing follows canvas zoom and pan instead of arrowhead coordinates', () => {
  const f = fixture(), a = arrow(700, 500); a.noteColor = '#112233';
  f.c.lightboxPaintActions.push(a);
  f.canvas.getBoundingClientRect = () => ({ left: 240, top: 80, width: 1600, height: 1200 });
  assert.equal(f.c.arrowNoteAtClientPoint(440, 280), a);
  assert.equal(f.c.arrowNoteAtClientPoint(480, 320), a);
  assert.equal(f.c.arrowNoteAtClientPoint(1640, 1080), null);
});
