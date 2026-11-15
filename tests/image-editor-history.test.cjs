const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const { createColorToolHistory } = require('../modules/region-hue.js');

function editor() {
  const context = {
    lightboxPainting: true, lightboxEditUndoStack: [], lightboxEditRedoStack: [],
    lightboxPaintActions: [], lightboxFillActions: [], lightboxEditBase: null,
    lightboxPlacedImage: null, lightboxPlacedSelected: false, lightboxBaseFlipX: false, lightboxBaseFlipY: false,
    lightboxLastFill: null, lightboxPaintOverlay: {}, lightboxDrawing: false, lightboxPaintCurrentAction: null,
    els: { lightboxPaintCanvas: { width: 100, height: 80 }, lightboxPaintUndo: {} },
    clearLightboxCrop() {}, syncLightboxPlacedControls() {}, rebuildLightboxPaintOverlay() {},
    markLightboxFillLayerDirty() {}, updateLightboxPaintDisplaySize() {}, commitLightboxLastFill() {}
  };
  context.cloneLightboxPlacedImage = value => value ? { ...value } : context.lightboxPlacedImage ? { ...context.lightboxPlacedImage } : null;
  const start = source.indexOf('function updateLightboxPaintUndo()');
  const end = source.indexOf('function cloneLightboxPlacedImage(', start);
  vm.runInNewContext(source.slice(start, end), context);
  return context;
}

test('image editor repeatedly undoes and redoes real action references', () => {
  const context = editor();
  const first = { id: 'first' }, second = { id: 'second' };
  for (const action of [first,second]) {
    context.lightboxPaintActions.push(action);
    context.pushLightboxEditUndo(() => context.lightboxPaintActions.splice(context.lightboxPaintActions.indexOf(action), 1));
  }
  context.undoLightboxPaint(); assert.equal(context.lightboxPaintActions.length, 1);
  context.redoLightboxPaint(); assert.equal(context.lightboxPaintActions[1], second);
  context.undoLightboxPaint(); context.undoLightboxPaint(); assert.equal(context.lightboxPaintActions.length, 0);
  context.redoLightboxPaint(); context.redoLightboxPaint();
  assert.equal(context.lightboxPaintActions[0], first); assert.equal(context.lightboxPaintActions[1], second);
  context.undoLightboxPaint(); context.pushLightboxEditUndo(() => {});
  assert.equal(context.lightboxEditRedoStack.length, 0);
});

test('redo restores edited base, dimensions and transforms rather than undoing the canvas project', () => {
  const context = editor();
  const base = { id: 'cropped' };
  context.lightboxEditBase = base;
  context.els.lightboxPaintCanvas.width = 200;
  context.lightboxBaseFlipX = true;
  context.pushLightboxEditUndo(() => { context.lightboxEditBase = null; context.els.lightboxPaintCanvas.width = 100; context.lightboxBaseFlipX = false; });
  context.undoLightboxPaint(); assert.equal(context.els.lightboxPaintCanvas.width, 100);
  context.redoLightboxPaint();
  assert.equal(context.lightboxEditBase, base);
  assert.equal(context.els.lightboxPaintCanvas.width, 200);
  assert.equal(context.lightboxPaintOverlay.width, 200);
  assert.equal(context.lightboxBaseFlipX, true);
});

test('color tool history restores brush and slider state and clears redo after a new edit', () => {
  let state = { brush: [0], hue: 0, base: '#FF0000' };
  const history = createColorToolHistory(() => structuredClone(state), value => { state = value; });
  history.remember(); state.brush = [255]; state.hue = 30;
  history.undo(); assert.deepEqual(state, { brush: [0], hue: 0, base: '#FF0000' });
  history.redo(); assert.equal(state.hue, 30); assert.deepEqual(state.brush, [255]);
  history.undo(); history.remember(); state.hue = 60; history.redo(); assert.equal(state.hue, 60);
});

test('picker auto-collects a color, creates a palette when missing and deduplicates HEX case', () => {
  let palette = null;
  const widget = { pendingName: '', selected: '' };
  const context = {
    paletteWidget: () => widget, paletteFor: () => palette,
    globalLibrary: { palettes: [] }, uid: () => 'palette-id',
    choosePalette: () => { palette = context.globalLibrary.palettes[0]; },
    renderEditorPalette() {}, refreshPalettes() {}
  };
  const start = source.indexOf('function collectPickedEditorColor(');
  const end = source.indexOf('document.addEventListener("change"', start);
  vm.runInNewContext(source.slice(start, end), context);
  context.collectPickedEditorColor('#aabbcc');
  assert.equal(palette.colors.length, 1); assert.equal(palette.colors[0].hex, '#AABBCC');
  context.collectPickedEditorColor('#AABBCC'); assert.equal(palette.colors.length, 1);
  context.collectPickedEditorColor('#FFFFFF'); assert.equal(palette.colors.length, 2);
  assert.equal(widget.selected, '#FFFFFF');
});
