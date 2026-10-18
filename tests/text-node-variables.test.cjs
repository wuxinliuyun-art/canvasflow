const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function fixture(definitions) {
  const c = { globalLibrary: { variableDefinitions: definitions }, console };
  vm.createContext(c);
  vm.runInContext(app.slice(app.indexOf('// ===== 文字节点内嵌变量'), app.indexOf('function buildNodeObject(')), c);
  return c;
}
const hair = { id: 'var-1', name: '发色', options: [{ id: 'opt-1', label: '红色' }] };
const board = { id: 'var-2', name: '发色板', options: [{ id: 'opt-2', label: '水彩' }] };

test('variable name only triggers with spaces before and after', () => {
  const c = fixture([hair]);
  assert.deepEqual(Array.from(c.detectTextNodeVariables('红色 发色 长发')).map(m => m.name), ['发色']);
  assert.equal(c.detectTextNodeVariables('红色发色长发').length, 0);
  assert.equal(c.detectTextNodeVariables('红发色长').length, 0);
});

test('text start and end count as boundaries, full-width space works', () => {
  const c = fixture([hair]);
  assert.deepEqual(Array.from(c.detectTextNodeVariables('发色 很好看')).map(m => m.name), ['发色']);
  assert.deepEqual(Array.from(c.detectTextNodeVariables('她喜欢 发色')).map(m => m.name), ['发色']);
  assert.deepEqual(Array.from(c.detectTextNodeVariables('发色')).map(m => m.name), ['发色']);
  assert.deepEqual(Array.from(c.detectTextNodeVariables('红色　发色　长发')).map(m => m.name), ['发色']);
});

test('longer name wins overlapping interval and follows space rule itself', () => {
  const c = fixture([board, hair]);
  assert.deepEqual(Array.from(c.detectTextNodeVariables('使用 发色板 工具')).map(m => m.name), ['发色板']);
  assert.equal(c.detectTextNodeVariables('使用 发色板工具').length, 0);
  assert.deepEqual(Array.from(c.detectTextNodeVariables('使用 发色 工具')).map(m => m.name), ['发色']);
});

test('all spaced occurrences are detected and expansion prepends label only there', () => {
  const c = fixture([hair]);
  const matches = c.detectTextNodeVariables('红色发色 发色 和 发色');
  assert.equal(matches.length, 2);
  const node = { text: '红色发色 发色 和 发色', variableChoices: { 发色: { optionId: 'opt-1', label: '红色' } } };
  assert.equal(c.expandTextNodeVariables(node), '红色发色 红色发色 和 红色发色');
});

test('disabled or unchosen variables keep original text', () => {
  const c = fixture([hair]);
  const off = { text: '红色 发色 长发', variableChoices: { 发色: { optionId: 'opt-1', label: '红色', enabled: false } } };
  assert.equal(c.expandTextNodeVariables(off), '红色 发色 长发');
  const none = { text: '红色 发色 长发', variableChoices: {} };
  assert.equal(c.expandTextNodeVariables(none), '红色 发色 长发');
});
