const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function block(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\nfunction ', start + 10));
}
function harness(enabled, direct = false) {
  const nodes = [
    { id: 't1', type: 'text', text: '文字1' },
    { id: 't2', type: 'text', text: '文字2' },
    { id: 'i1', type: 'image', image: '图片1', x: 200 },
    { id: 'i2', type: 'image', image: '图片2', x: 400 },
    { id: 'ai', type: 'ai-image' },
  ];
  const pairs = direct ? [['t1','ai'], ['i2','ai'], ['i1','ai'], ['t2','ai']]
    : [['t1','i1'], ['t2','i1'], ['i1','i2'], ['i2','ai']];
  const edges = pairs.map(([from,to], i) => ({id: `e${i}`, from: {node: from}, to: {node: to}}));
  const state = { settings: enabled === undefined ? {} : {combineParallelInputs: enabled}, nodes, edges };
  const context = {
    state, window: {}, findNode: id => nodes.find(n => n.id === id),
    buildIncomingIndex: () => { const map = new Map(); for (const e of edges) { if (!map.has(e.to.node)) map.set(e.to.node, []); map.get(e.to.node).push(e); } return map; },
    expandTextNodeVariables: n => n.text || '', variableNodeOutput: () => '',
    isLinkedUpscaleNode: () => false, isAutoMattingTool: () => false,
  };
  vm.createContext(context);
  vm.runInContext(block('collectUpstreamForAI') + '\n' + block('splitMultiInputAiNode'), context);
  return { context, state, collect: () => JSON.parse(JSON.stringify(context.collectUpstreamForAI('ai'))) };
}
test('默认或关闭：用户示例分别生成两条支线，各带两张图片', () => {
  for (const enabled of [undefined, false]) {
    const result = harness(enabled).collect();
    assert.deepEqual(result.branches.map(b => ({texts: b.texts, images: b.images.map(i => i.image)})), [
      {texts: ['文字1'], images: ['图片1','图片2']}, {texts: ['文字2'], images: ['图片1','图片2']},
    ]);
  }
});
test('开启：两段文字和两张共用图片合为一个分支，图片不重复', () => {
  const h = harness(true);
  const result = h.collect();
  assert.equal(result.branches.length, 1);
  assert.deepEqual(result.branches[0].texts, ['文字1','文字2']);
  assert.deepEqual(result.branches[0].images.map(i => i.image), ['图片1','图片2']);
  h.state.settings.combineParallelInputs = false;
  assert.equal(h.collect().branches.length, 2);
});
test('开启也覆盖 AI 多条直接入线，不拆 AI 节点，合并后图片按画布 x 排序', () => {
  const h = harness(true, true);
  assert.deepEqual(Array.from(h.context.splitMultiInputAiNode('ai')), ['ai']);
  assert.equal(h.state.nodes.length, 5);
  const result = h.collect();
  assert.equal(result.branches.length, 1);
  assert.deepEqual(result.branches[0].texts, ['文字1','文字2']);
  assert.deepEqual(result.branches[0].images.map(i => i.image), ['图片1','图片2']);
});
test('已有节点合并标记保持兼容，工具节点不受全局开关影响', () => {
  const h = harness(false);
  h.state.nodes.find(n => n.id === 'ai').keepCombinedInputs = true;
  assert.equal(h.collect().branches.length, 1);
  h.state.nodes.find(n => n.id === 'ai').type = 'tool-node';
  h.state.settings.combineParallelInputs = true;
  assert.equal(h.collect().branches.length, 2);
});
test('设置在新建和旧存档加载时默认关闭，开关写回可持久化设置', () => {
  assert.equal((source.match(/combineParallelInputs: false/g) || []).length, 2);
  assert.match(source, /els\.combineParallelInputs\.checked = state\.settings\.combineParallelInputs === true/);
  assert.match(source, /els\.combineParallelInputs\.onchange = \(\) => \{\s*state\.settings\.combineParallelInputs = els\.combineParallelInputs\.checked;\s*pushHistory\(\);/);
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /id="combineParallelInputsToggle" type="checkbox">/);
  assert.match(html, /aria-label="并联连线任务说明"/);
});
