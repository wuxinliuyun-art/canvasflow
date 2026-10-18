const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../modules/manual-matting.js'), 'utf8');
const enqueueSource = source.slice(
  source.indexOf('function enqueueRegionMatting('),
  source.indexOf('// Tie drafts to the actual pixels')
);

function fixture(existingTasks = [], activePageId = 'page-new') {
  const queued = [];
  const sourceNode = { id: 'shared-node-id', type: 'image' };
  const context = {
    activeApiKey: () => 'key',
    activeApiType: () => 'apimart',
    aiTaskQueue: { items: existingTasks, nextId: 10 },
    buildAiQueueTasks: (_node, _upstream, _mode, runId) => [{
      id: 'q10', nodeId: sourceNode.id, pageId: activePageId, runId,
      regularImages: [], orderedImages: [], status: 'waiting'
    }],
    findNode: id => id === sourceNode.id ? sourceNode : null,
    modelCatalogEntry: () => ({}),
    queueTaskIsSettled: task => ['done', 'failed', 'cancelled'].includes(task.status),
    refreshQueuedNodeProgress() {},
    renderTaskQueue() {},
    state: { activePageId, nodes: [sourceNode] },
    Date,
  };
  vm.createContext(context);
  vm.runInContext(enqueueSource, context);
  const region = { id: 1, rect: [0, 0, 10, 10], canvas: { toDataURL: () => 'data:image/png;base64,AA==' } };
  return {
    enqueue: apiType => {
      const result = context.enqueueRegionMatting(sourceNode.id, [region], [10, 10], apiType);
      queued.push(...context.aiTaskQueue.items.filter(task => task.id === 'q10'));
      return result;
    },
    context,
    queued,
  };
}

test('local matting is not blocked by a GPT task on the same image', () => {
  const remote = { nodeId: 'shared-node-id', pageId: 'page-new', status: 'submitting', localMatting: false };
  const { enqueue, context } = fixture([remote]);
  assert.equal(enqueue('local').count, 1);
  assert.equal(context.aiTaskQueue.items.at(-1).localMatting, true);
});

test('APIMart region matting uses Flare while AGToken keeps standard GPT Image 2.5', () => {
  const { enqueue, context } = fixture([]);
  enqueue('apimart');
  assert.equal(context.aiTaskQueue.items.at(-1).generationSettings._model, 'gpt-image-2.5-flare');
  const agtoken = fixture([]);
  agtoken.enqueue('agtoken');
  assert.equal(agtoken.context.aiTaskQueue.items.at(-1).generationSettings._model, 'gpt-image-2.5');
});

test('same-type duplicate remains blocked, while another project never conflicts', () => {
  const local = { nodeId: 'shared-node-id', pageId: 'page-new', status: 'submitting', localMatting: true };
  assert.throws(() => fixture([local]).enqueue('local'), /本地抠图任务/);

  const otherPage = { ...local, pageId: 'page-old' };
  assert.equal(fixture([otherPage]).enqueue('local').count, 1);
});

test('scheduler keeps local work out of remote slots and remote stagger selection', () => {
  const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  assert.match(app, /task\.localMatting \? \(\) => \{\} : await acquireAiApiSlot/);
  assert.match(app, /aiTaskQueue\.localRunning < 1/);
  assert.match(app, /!item\.localMatting && item\.status === "waiting"/);
});
