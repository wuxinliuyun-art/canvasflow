const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const actionsStart = source.indexOf("function textPromptActionsHtml");
const actionsEnd = source.indexOf("function nodeTemplate", actionsStart);
assert.ok(actionsStart >= 0 && actionsEnd > actionsStart, "text prompt actions template should exist in app.js");
const pendingStart = source.indexOf("const promptOptimizationPending = new Set();");

function setup(options = {}) {
  const node = { id: "text-1", type: "text", text: "画一只猫", w: options.nodeWidth ?? 240, ...(options.nodeFields || {}) };
  const context = {
    state: { settings: { apiKey: "key-apimart", agtokenApiKey: "key-agtoken" } },
    chatCatalogModels: () => options.models ?? [
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol（APIMart）", apiType: "apimart" },
      { id: "gpt-6-sol", label: "GPT-6 Sol（AGToken）", apiType: "agtoken" },
    ],
    escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])),
    // canvas 2d 在 Node 不可用：注入假测量上下文（CJK 每字符 12px、其余 7px），并预置 holder 使 document 不被触达
    document: { createElement: () => ({ getContext: () => ({ font: "", measureText: t => ({ width: String(t).split("").reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 12 : 7), 0) }) }) }) },
  };
  vm.runInNewContext(
    source.slice(pendingStart, pendingStart + source.slice(pendingStart).indexOf("\n") + 1)
    + source.slice(source.indexOf("function selectedPromptOptimizeModel"), source.indexOf("async function requestPromptOptimization"))
    + source.slice(actionsStart, actionsEnd)
    + "\nthis.actions = textPromptActionsHtml; this.selectedModel = selectedPromptOptimizeModel;",
    context
  );
  return { context, node };
}

test("selector renders with the per-node model selected and full option list", () => {
  const { context, node } = setup({ nodeWidth: 320, nodeFields: { _promptOptimizeModel: "gpt-6-sol" } });
  const html = context.actions(node);
  assert.match(html, /data-role="prompt-model"/);
  assert.match(html, /value="gpt-6-sol" selected/);
  assert.match(html, /value="gpt-6.1-sol"/);
  assert.doesNotMatch(html, /is-compact/);
  assert.match(html, /aria-label="优化模型：GPT-6 Sol（AGToken）"/);
});

test("wide node shows full model name, narrow node collapses to an icon with title fallback", () => {
  const wide = setup({ nodeWidth: 320 });
  const wideHtml = wide.context.actions(wide.node);
  assert.doesNotMatch(wideHtml, /is-compact/);
  assert.match(wideHtml, /inline-size:\d+px/);

  const narrow = setup({ nodeWidth: 140 });
  const narrowHtml = narrow.context.actions(narrow.node);
  assert.match(narrowHtml, /is-compact/);
  assert.match(narrowHtml, /prompt-model-icon/);
  assert.match(narrowHtml, /title="优化模型：GPT-6.1 Sol（APIMart）"/);
});

test("unavailable or deleted model falls back to the first available model", () => {
  const { context, node } = setup({ nodeFields: { _promptOptimizeModel: "removed-model" } });
  const html = context.actions(node);
  assert.match(html, /value="gpt-6.1-sol" selected/);
});

test("no available models renders a disabled placeholder without options", () => {
  const { context, node } = setup({ models: [] });
  const html = context.actions(node);
  assert.match(html, /is-empty/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /value="gpt-6/);
});

test("selector never embeds a request trigger: markup contains no fetch/send action", () => {
  const { context, node } = setup();
  const html = context.actions(node);
  assert.doesNotMatch(html, /browser-generate|ai-generate|chat-send/);
  assert.match(html, /data-role="prompt-model"/);
});
