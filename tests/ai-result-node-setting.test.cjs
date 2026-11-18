const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function enqueue(setting, branchCount = 1, count = 1) {
  const node = { id: 'ai1', type: 'ai-image' };
  const queue = { items: [], nextId: 1 };
  const context = {
    state: { settings: setting === undefined ? {} : { aiResultAsImageNode: setting }, nodes: [node] },
    aiTaskQueue: queue,
    splitMultiInputAiNode: () => [node.id], findNode: () => node,
    taskQueueForNode: () => [], queueTaskIsSettled: () => false,
    refreshAiPrompt() {},
    collectUpstreamForAI: () => ({ texts: ['prompt'], groupTexts: [], groupImages: [], branches: Array.from({length: branchCount}, () => ({texts: ['prompt'], images: []})) }),
    queuedGenerationSettings: () => ({}), isImage25ExtModel: () => false,
    buildAiQueueTasks: (_node, _inputs, resultMode) => Array.from({length: count}, () => ({ resultMode })),
    refreshQueuedNodeProgress() {}, render() {}, renderTaskQueue() {}, pumpAiTaskQueue() {}, toast() {}, pushHistory() {},
  };
  const start = source.indexOf('function enqueueAiNode(');
  const end = source.indexOf('\nasync function generateAiImage(', start);
  vm.runInNewContext(`${source.slice(start, end)}\nenqueueAiNode('ai1');`, context);
  return queue.items.map(task => task.resultMode);
}
test('single result uses preview by default and for old settings', () => {
  assert.deepEqual(enqueue(undefined), ['node-preview']);
  assert.deepEqual(enqueue(false), ['node-preview']);
});
test('enabled setting sends single and multiple results to connected image nodes', () => {
  assert.deepEqual(enqueue(true), ['image-node']);
  assert.deepEqual(enqueue(true, 1, 3), ['image-node', 'image-node', 'image-node']);
});
test('disabled setting preserves fan-in and extra-image results', () => {
  assert.deepEqual(enqueue(false, 2), ['image-node', 'image-node']);
  assert.deepEqual(enqueue(false, 1, 2), ['node-preview', 'image-node']);
});
