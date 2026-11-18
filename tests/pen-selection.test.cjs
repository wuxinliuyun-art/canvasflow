const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const geometry = require('../modules/fill-selection.js');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const point = (x, y) => ({ x, y, in: { x, y }, out: { x, y } });

test('Bezier segments use the previous outgoing and next incoming handle, including closure', () => {
  const points = [point(1, 2), point(10, 20)];
  points[0].out = { x: 3, y: 4 }; points[1].in = { x: 5, y: 6 };
  assert.equal(geometry.penSelectionPathData(points), 'M 1 2 C 3 4 5 6 10 20');
  assert.equal(geometry.penSelectionPathData(points, true), 'M 1 2 C 3 4 5 6 10 20 C 10 20 1 2 1 2 Z');
});

test('moving anchors carries both handles; dragging handles mirrors unless Alt is held', () => {
  const p = point(10, 10);
  geometry.movePenSelectionPoint(p, { x: 20, y: 15 }, 'out');
  assert.deepEqual(p.in, { x: 0, y: 5 });
  geometry.movePenSelectionPoint(p, { x: 12, y: 14 }, 'anchor');
  assert.deepEqual(p.out, { x: 22, y: 19 });
  assert.deepEqual(p.in, { x: 2, y: 9 });
  geometry.movePenSelectionPoint(p, { x: 40, y: 30 }, 'out', true);
  assert.deepEqual(p.in, { x: 2, y: 9 });
});

test('replace/add/subtract handle overlap, holes and empty selections without mutating history', () => {
  const before = Uint8Array.from([1, 1, 0, 0]), next = Uint8Array.from([0, 1, 1, 0]);
  assert.deepEqual([...geometry.combinePenSelectionMasks(before, next, 'replace')], [0, 1, 1, 0]);
  assert.deepEqual([...geometry.combinePenSelectionMasks(before, next, 'add')], [1, 1, 1, 0]);
  assert.deepEqual([...geometry.combinePenSelectionMasks(before, next, 'subtract')], [1, 0, 0, 0]);
  assert.deepEqual([...geometry.combinePenSelectionMasks(null, next, 'subtract')], [0, 0, 0, 0]);
  assert.deepEqual([...before], [1, 1, 0, 0]);
});

function editor() {
  const buttons = {}, events = {}, undo = [];
  const drawCalls = [];
  const draw = new Proxy({}, { get: (o, key) => o[key] || ((...args) => drawCalls.push([key, ...args])) });
  class Path {
    constructor(d) { this.d = d; this.rects = []; }
    rect(...args) { this.rects.push(args); }
    moveTo() {} lineTo() {}
  }
  const overlay = { classList: { toggle() {} }, style: {}, setAttribute() {}, getContext: () => draw };
  const canvas = { width: 80, height: 80, getBoundingClientRect: () => ({ left: 10, top: 20, width: 80, height: 80 }), setPointerCapture() {}, addEventListener() {}, dispatchEvent() {} };
  const context = {
    ...geometry, structuredClone, Event, Path2D: Path, lightboxPainting: true, lightboxPaintMode: 'pen',
    els: { lightboxPaintCanvas: canvas, lightbox: { appendChild() {} } },
    document: { createElement: () => overlay, addEventListener: (type, fn) => { events[type] = fn; } },
    window: { devicePixelRatio: 1 }, getComputedStyle: () => ({ getPropertyValue: () => 'token' }),
    $: id => buttons[id] ||= { value: 'replace' }, pushLightboxEditUndo: fn => undo.push(fn),
    paintCanvasPoint: e => ({ x: e.x, y: e.y, scale: 1 }), setLightboxPaintMode: value => { context.lightboxPaintMode = value; },
  };
  const start = source.indexOf('let lightboxPenPoints =');
  const end = source.indexOf('const lightboxCropBtn =', start);
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const event = (x, y, extra = {}) => ({ x, y, pointerId: 1, type: 'pointerup', ...extra });
  const down = (x, y, extra) => context.beginLightboxPen(event(x, y, extra), { x, y, scale: 1 });
  const up = (x, y, extra) => context.finishLightboxPen(event(x, y, extra));
  const state = () => context.captureLightboxSelection();
  // The gesture tests exercise real source and geometry; raster output is separately stubbed.
  vm.runInContext('updateLightboxPenMask = () => { lightboxSelection = { mask: new Uint8Array([1]), outline: new Path2D(), clip: new Path2D() }; };', context);
  return { context, buttons, undo, event, down, up, state, events, drawCalls };
}

test('click creates a corner, drag creates mirrored Bezier handles, and an open path remains editable', () => {
  const e = editor();
  e.down(10, 10); e.up(10, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(e.state().points[0])), point(10, 10));
  e.down(50, 10); e.context.moveLightboxPen(e.event(60, 20)); e.up(60, 20);
  assert.equal(e.state().points.length, 2);
  assert.equal(e.state().points[1].in.x, 40);
  e.down(50, 10); e.up(50, 20);
  assert.equal(e.state().points[1].y, 20);
  assert.equal(e.state().points[1].out.y, 30);
  e.undo.at(-1)(); assert.equal(e.state().points[1].y, 10);
});

test('closure preserves editable anchors; a new path captures the current selection for add/subtract', () => {
  const e = editor();
  for (const [x, y] of [[10, 10], [50, 10], [50, 50]]) { e.down(x, y); e.up(x, y); }
  e.down(10, 10); assert.equal(e.state().closed, true);
  e.down(50, 50); e.up(40, 50);
  assert.equal(e.state().points[2].x, 40);
  assert.equal(e.state().closed, true);
  const base = e.state().selection;
  e.buttons.lightboxSelectionOperation.value = 'subtract';
  e.down(70, 70); e.up(70, 70);
  assert.equal(e.state().points.length, 1);
  assert.equal(e.state().operation, 'subtract'); assert.equal(e.state().base, base);
  e.undo.at(-1)(); assert.equal(e.state().points.length, 3); assert.equal(e.state().closed, true);
});

test('pointer cancellation restores the draft, and Ctrl-drag moves the first anchor without closing', () => {
  const e = editor();
  for (const [x, y] of [[10, 10], [50, 10], [50, 50]]) { e.down(x, y); e.up(x, y); }
  e.down(10, 10, { ctrlKey: true }); e.up(20, 20);
  assert.equal(e.state().closed, false); assert.equal(e.state().points[0].x, 20);
  const count = e.undo.length;
  e.down(70, 70); e.up(70, 70, { type: 'pointercancel' });
  assert.equal(e.state().points.length, 3); assert.equal(e.undo.length, count);
});

test('scanline clipping preserves disjoint areas and holes rather than a bounding rectangle', () => {
  const e = editor();
  const selection = e.context.makeLightboxSelection(Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]), 3, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(selection.clip.rects)), [[0, 0, 3, 1], [0, 1, 1, 1], [2, 1, 1, 1], [0, 2, 3, 1]]);
});

test('Alt-dragging an existing corner pulls new handles instead of moving the anchor', () => {
  const e = editor();
  e.down(10, 10); e.up(10, 10);
  e.down(10, 10, { altKey: true }); e.up(20, 15, { altKey: true });
  const p = e.state().points[0];
  assert.equal(p.x, 10); assert.equal(p.y, 10);
  assert.equal(p.out.x, 20); assert.equal(p.in.x, 0);
});

test('brush mode shows only the vector pen path without raster outlines, dashes or control handles', () => {
  const e = editor();
  for (const [x, y] of [[10, 10], [50, 10], [50, 50]]) { e.down(x, y); e.up(x, y); }
  e.context.closeLightboxPenPath();
  e.context.lightboxPaintMode = 'idle';
  e.drawCalls.length = 0;
  e.context.syncLightboxSelectionOverlay();
  const strokes = e.drawCalls.filter(call => call[0] === 'stroke');
  assert.equal(strokes.length, 1);
  assert.equal(strokes[0][1].d, geometry.penSelectionPathData(e.state().points, true));
  assert.equal(e.drawCalls.some(call => ['setLineDash', 'fillRect', 'strokeRect', 'arc'].includes(call[0])), false);
});

test('each stroke clips to its own selection snapshot, keeping later selection edits from changing painted pixels', () => {
  const start = source.indexOf('function drawLightboxPaintSegment('), end = source.indexOf('\nfunction drawLightboxShape(', start);
  const calls = [], clip = {};
  const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]) });
  const context = { lightboxFillSettings: { keepLines: false } };
  vm.runInNewContext(source.slice(start, end), context);
  context.drawLightboxPaintSegment(ctx, { mode: 'brush', color: 'token', size: 4, selection: { clip } }, { x: 0, y: 0 }, { x: 4, y: 4 });
  assert.equal(calls[1][0], 'clip'); assert.equal(calls[1][1], clip);
  assert.equal(calls.at(-1)[0], 'restore');
});
