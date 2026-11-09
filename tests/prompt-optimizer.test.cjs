const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const rulesStart = source.indexOf("const PROMPT_OPTIMIZATION_INSTRUCTIONS =");
const rulesEnd = source.indexOf("function openPromptOptimizer", rulesStart);
assert.ok(rulesStart >= 0 && rulesEnd > rulesStart, "optimizer block should exist in app.js");
const actionsStart = source.indexOf("function textPromptActionsHtml");
const actionsEnd = source.indexOf("function nodeTemplate", actionsStart);
assert.ok(actionsStart >= 0 && actionsEnd > actionsStart, "text prompt actions template should exist in app.js");

function setup(options = {}) {
  const requests = [];
  const node = { id: "text-1", type: "text", text: options.nodeText ?? "画一只猫" };
  const pushed = [];
  const context = {
    desktop: options.desktop ?? false,
    state: { settings: { apiKey: "key-apimart", agtokenApiKey: "key-agtoken", chatCustomKeys: { s1: "key-custom" } } },
    chatCatalogModels: () => options.models ?? [{ id: "gpt-6.1-sol", label: "GPT-6.1 Sol", apiType: "apimart", multimodal: false }],
    chatModelEntry: modelId => (options.chatModelEntry ?? ((id) => (context.chatCatalogModels().find(item => item.id === id) || null)))(modelId),
    chatCustomSiteById: siteId => (options.customSites?.[siteId] ?? { id: siteId, name: "本地站点", baseUrl: "https://example.com/v1", modelNames: ["my-model"] }),
    chatCustomSiteKey: siteId => (options.customKeys?.[siteId] ?? (siteId === "s1" ? "key-custom" : "")),
    findNode: id => (id === node.id ? node : null),
    publishScreenshotNodeCatalog: () => {},
    pushHistory: () => pushed.push(node.text),
    chatContentToText: content => {
      if (typeof content === "string") return content.trim();
      if (Array.isArray(content)) return content.map(part => (part && typeof part === "object" && typeof part.text === "string" ? part.text : "")).join("").trim();
      return "";
    },
    apiFetch: async (url, fetchOptions) => {
      requests.push({ url, options: fetchOptions, body: JSON.parse(fetchOptions.body) });
      return typeof options.respond === "function" ? options.respond(requests.length) : { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "更清晰的提示词" } }] }) };
    },
  };
  vm.runInNewContext(source.slice(rulesStart, rulesEnd) + "\nthis.optimize = requestPromptOptimization; this.apply = applyPromptOptimization; this.restore = restorePromptOptimizedText; this.buildMessages = buildPromptOptimizationMessages; this.selectedModel = selectedPromptOptimizeModel; this.instructions = PROMPT_OPTIMIZATION_INSTRUCTIONS; this.pendingSet = promptOptimizationPending;", context);
  vm.runInNewContext(source.slice(actionsStart, actionsEnd), context);
  return { context, node, requests, pushed };
}

test("optimization instructions are industry-neutral and preserve user constraints", () => {
  const harness = setup();
  const { instructions } = harness.context;
  for (const mode of ["image", "chat"]) {
    assert.match(instructions[mode], /保留/);
    assert.match(instructions[mode], /专有名词/);
    assert.match(instructions[mode], /数量/);
    assert.match(instructions[mode], /明确限制/);
  }
  assert.match(instructions.image, /图像生成/);
  assert.match(instructions.chat, /AI 对话/);
  const serialized = JSON.stringify(instructions);
  assert.doesNotMatch(serialized, /服装|时装|fashion|garment/i, "rules must not bake in any industry preference");
});

test("message builder passes Chinese, English and multi-paragraph prompts verbatim", () => {
  const harness = setup();
  const { buildMessages } = harness.context;
  for (const prompt of ["画一只猫", "a neon cyberpunk street at night", "第一段：主体描述\n\n第二段：风格要求\n第三段：限制条件"]) {
    const messages = buildMessages(prompt, "image");
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "system");
    assert.equal(messages[1].role, "user");
    assert.equal(messages[1].content, prompt);
  }
  assert.throws(() => buildMessages("x", "unknown"), /未知的优化方向/);
});

test("built-in apimart optimization posts the selected model to the chat proxy with the apimart key slot", async () => {
  const harness = setup();
  const reply = await harness.context.optimize("画一只猫", "image", "gpt-6.1-sol");
  assert.equal(reply, "更清晰的提示词");
  const sent = harness.requests[0];
  assert.equal(sent.url, "/api/chat/completions");
  assert.equal(sent.body.model, "gpt-6.1-sol");
  assert.equal(sent.body.apiType, "apimart");
  assert.equal(sent.body.stream, false);
  assert.equal(sent.body._apiKey, "key-apimart");
  assert.equal(sent.body.messages[1].content, "画一只猫");
});

test("agtoken optimization uses the agtoken key slot and unwraps standard responses", async () => {
  const harness = setup({
    models: [{ id: "gpt-6-sol", label: "GPT-6 Sol", apiType: "agtoken", multimodal: false }],
    respond: () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: [{ type: "text", text: "标准结构回复" }] } }] }) }),
  });
  const reply = await harness.context.optimize("画一只猫", "image", "gpt-6-sol");
  assert.equal(reply, "标准结构回复");
  assert.equal(harness.requests[0].body.apiType, "agtoken");
  assert.equal(harness.requests[0].body._apiKey, "key-agtoken");
});

test("custom site optimization forwards the real model name, base url and site key", async () => {
  const harness = setup({
    models: [{ id: "custom:s1:my-model", label: "本地站点·my-model", apiType: "custom", multimodal: false, model: "my-model", siteId: "s1" }],
  });
  await harness.context.optimize("帮我写摘要", "chat", "custom:s1:my-model");
  const sent = harness.requests[0].body;
  assert.equal(sent.model, "my-model", "upstream model must be the real name, not the custom: prefixed id");
  assert.equal(sent.apiType, "custom");
  assert.deepEqual(sent.__chatCustom, { baseUrl: "https://example.com/v1", siteId: "s1" });
  assert.equal(sent._apiKey, "key-custom");
  assert.match(sent.messages[0].content, /AI 对话/);
});

test("desktop mode never attaches keys for built-in providers", async () => {
  const harness = setup({ desktop: true });
  await harness.context.optimize("画一只猫", "image", "gpt-6.1-sol");
  assert.equal(harness.requests[0].body._apiKey, undefined);
});

test("unavailable model, upstream failure, 404 and empty replies all fail without touching the node", async () => {
  const harness = setup({ chatModelEntry: () => null });
  await assert.rejects(() => harness.context.optimize("画一只猫", "image", "gone"), /不可用/);
  assert.equal(harness.node.text, "画一只猫");

  const failing = setup({ respond: () => ({ ok: false, status: 500, json: async () => ({ error: { message: "上游超时" } }) }) });
  await assert.rejects(() => failing.context.optimize("画一只猫", "image", "gpt-6.1-sol"), /上游超时/);
  assert.equal(failing.node.text, "画一只猫");

  const notFound = setup({ respond: () => ({ ok: false, status: 404, json: async () => ({}) }) });
  await assert.rejects(() => notFound.context.optimize("画一只猫", "image", "gpt-6.1-sol"), /重启/);

  const empty = setup({ respond: () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "" } }] }) }) });
  await assert.rejects(() => empty.context.optimize("画一只猫", "image", "gpt-6.1-sol"), /没有返回优化后的提示词/);
  assert.equal(empty.node.text, "画一只猫");
});

test("optimization never replaces the prompt until the user explicitly applies the result", async () => {
  const harness = setup();
  await harness.context.optimize("画一只猫", "image", "gpt-6.1-sol");
  assert.equal(harness.node.text, "画一只猫");
  assert.equal(harness.node._promptOriginalText, undefined);
});

test("apply replaces the text once, keeps the original for undo, and keeps other node fields intact", () => {
  const harness = setup();
  harness.node.customField = "keep-me";
  const before = { ...harness.node };
  const result = harness.context.apply(harness.node.id, "更清晰的提示词", "画一只猫");
  assert.equal(result.ok, true);
  assert.equal(harness.node.text, "更清晰的提示词");
  assert.equal(harness.node._promptOriginalText, "画一只猫");
  assert.equal(harness.node.customField, "keep-me");
  assert.deepEqual(harness.pushed, ["更清晰的提示词"]);
  assert.ok(before);

  const secondApply = harness.context.apply(harness.node.id, "再次优化", "画一只猫");
  assert.equal(secondApply.ok, false, "re-applying with a stale original must be rejected");
  assert.equal(harness.node.text, "更清晰的提示词");
});

test("apply rejects empty results and prompts edited after the dialog opened", () => {
  const harness = setup();
  const empty = harness.context.apply(harness.node.id, "   ", "画一只猫");
  assert.equal(empty.ok, false);
  assert.match(empty.message, /为空/);
  assert.equal(harness.node.text, "画一只猫");

  harness.node.text = "用户已经改过的话";
  const stale = harness.context.apply(harness.node.id, "更清晰的提示词", "画一只猫");
  assert.equal(stale.ok, false);
  assert.match(stale.message, /已被编辑/);
  assert.equal(harness.node.text, "用户已经改过的话");
});

test("restore brings back the exact original prompt and clears the undo state", () => {
  const harness = setup();
  assert.equal(harness.context.restore(harness.node.id).ok, false, "restore before any apply is a no-op");
  harness.context.apply(harness.node.id, "更清晰的提示词", "画一只猫");
  const restored = harness.context.restore(harness.node.id);
  assert.equal(restored.ok, true);
  assert.equal(harness.node.text, "画一只猫");
  assert.equal(harness.node._promptOriginalText, undefined);
  assert.equal(harness.context.restore(harness.node.id).ok, false);
});

test("node entry button reflects undo state and disables itself while a request is pending", () => {
  const harness = setup();
  const button = node => {
    const html = harness.context.textPromptActionsHtml(node);
    return { label: />(还原|优化)</.exec(html)?.[1], disabled: /disabled/.test(html) };
  };
  assert.deepEqual(button(harness.node), { label: "优化", disabled: false });

  harness.context.pendingSet.add(harness.node.id);
  assert.deepEqual(button(harness.node), { label: "优化", disabled: true });
  harness.context.pendingSet.delete(harness.node.id);

  harness.context.apply(harness.node.id, "更清晰的提示词", "画一只猫");
  assert.deepEqual(button(harness.node), { label: "还原", disabled: false });
  harness.context.restore(harness.node.id);
  assert.deepEqual(button(harness.node), { label: "优化", disabled: false });
});

test("selected model prefers the per-node choice and falls back to the first available model", () => {
  const models = [
    { id: "gpt-6.1-sol", apiType: "apimart" },
    { id: "gpt-6-sol", apiType: "agtoken" },
  ];
  const harness = setup({ models });
  assert.equal(harness.context.selectedModel({ _promptOptimizeModel: "gpt-6-sol" }, models).id, "gpt-6-sol");
  assert.equal(harness.context.selectedModel({ _promptOptimizeModel: "removed-model" }, models).id, "gpt-6.1-sol");
  assert.equal(harness.context.selectedModel({}, models).id, "gpt-6.1-sol");
  assert.equal(harness.context.selectedModel({}, []), null);
});
