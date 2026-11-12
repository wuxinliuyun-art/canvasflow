// 分站点默认对话模型：vm 切片 chatDefaultModelForSite 真实源码（含 chatSiteKeyReady /
// chatBuiltinModelIds 依赖），不发起任何请求。锁死四个事实：
// ① 只填 APIMart key 的新建对话节点默认 GPT-6 Luna；
// ② 只填 AGToken key 的新建对话节点默认 Gemini 3.8 Flash；
// ③ 两家 key 都填或都没填时返回空串（调用方落回目录全局 defaultModel gpt-6-astra）；
// ④ 站点物化列表里删掉默认模型时返回空串，避免默认指向不可见模型。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

const SLICE_START = '// 分站点默认对话模型';
const SLICE_END = '\nfunction chatSiteModelsCustomized(';

const CHAT_CATALOG = {
  defaultModel: 'gpt-6-astra',
  siteDefaults: { apimart: 'gpt-6-luna', agtoken: 'gemini-3.8-flash' },
  models: [
    { id: 'gpt-6-luna', label: 'GPT-6 Luna（APIMart）', apiType: 'apimart', multimodal: false },
    { id: 'gpt-6-sol', label: 'GPT-6 Sol（AGToken）', apiType: 'agtoken', multimodal: false },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra（AGToken）', apiType: 'agtoken', multimodal: false },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash（AGToken）', apiType: 'agtoken', multimodal: false },
  ],
};

function buildSlice({ apiKey = '', agtokenApiKey = '', chatSiteModels = null } = {}) {
  const start = source.indexOf(SLICE_START);
  assert.ok(start > 0, 'slice start marker not found');
  const end = source.indexOf(SLICE_END, start);
  assert.ok(end > start, 'slice end marker not found');
  const context = {
    state: { settings: { apiKey, agtokenApiKey, ...(chatSiteModels ? { chatSiteModels } : {}) } },
    window: { CANVASFLOW_CHAT_CATALOG: CHAT_CATALOG },
    module: { exports: {} },
  };
  vm.runInNewContext(source.slice(start, end) + '\nmodule.exports = { chatDefaultModelForSite };', context);
  return context.module.exports;
}

test('apimart-only key defaults to GPT-6 Luna', () => {
  const { chatDefaultModelForSite } = buildSlice({ apiKey: 'sk-apimart' });
  assert.equal(chatDefaultModelForSite(), 'gpt-6-luna');
});

test('agtoken-only key defaults to Gemini 3.8 Flash', () => {
  const { chatDefaultModelForSite } = buildSlice({ agtokenApiKey: 'sk-agtoken' });
  assert.equal(chatDefaultModelForSite(), 'gemini-3.8-flash');
});

test('both keys filled falls back to the global default (empty here)', () => {
  const { chatDefaultModelForSite } = buildSlice({ apiKey: 'sk-a', agtokenApiKey: 'sk-b' });
  assert.equal(chatDefaultModelForSite(), '');
});

test('no keys filled falls back to the global default (empty here)', () => {
  const { chatDefaultModelForSite } = buildSlice({});
  assert.equal(chatDefaultModelForSite(), '');
});

test('site default removed from the materialized list yields empty string', () => {
  const { chatDefaultModelForSite } = buildSlice({ apiKey: 'sk-apimart', chatSiteModels: { apimart: ['gpt-6.1-sol'] } });
  assert.equal(chatDefaultModelForSite(), '');
});

test('node template chains chatDefaultModelForSite before the catalog fallback', () => {
  const line = source.split('\n').find(row => row.includes('_chatModel: type === "chat"'));
  assert.ok(line, 'chat node template line not found');
  assert.ok(line.includes('String(state.settings.chatDefaultModel || "") || chatDefaultModelForSite()'),
    'explicit default model wins over the per-site default');
  assert.ok(line.includes('chatDefaultModelForSite() || window.CANVASFLOW_CHAT_CATALOG?.defaultModel'),
    'per-site default wins over the global catalog default');
});
