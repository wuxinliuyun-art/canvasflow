const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('light canvas defaults use the adjusted pale background and grid', () => {
  const lightRoot = css.slice(css.indexOf(':root {'), css.indexOf('.theme-dark {'));
  assert.match(lightRoot, /--canvas-bg:\s*#f5f5f5;/);
  assert.match(lightRoot, /--canvas-grid:\s*#e8e8e8;/);
  assert.match(lightRoot, /--canvas-cross:\s*#e8e8e8;/);
  assert.match(lightRoot, /--canvas-dot:\s*#e8e8e8;/);
  assert.match(app, /key:\s*"bg"[^\n]+lightDefault:\s*"#f5f5f5"/);
  assert.match(app, /key:\s*"grid"[^\n]+lightDefault:\s*"#e8e8e8"/);
});

test('dark canvas defaults remain unchanged', () => {
  const darkRoot = css.slice(css.indexOf('.theme-dark {'), css.indexOf('button, input'));
  assert.match(darkRoot, /--canvas-bg:\s*#000000;/);
  assert.match(darkRoot, /--canvas-grid:\s*#212121;/);
  assert.match(app, /key:\s*"grid"[^\n]+darkDefault:\s*"#212121"/);
});
