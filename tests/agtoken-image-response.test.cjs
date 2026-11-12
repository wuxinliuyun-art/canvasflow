const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
const start = app.indexOf("async function parseAgtokenImageResponse(");
const end = app.indexOf("async function submitAgtokenGeneration(");
const context = {};
vm.createContext(context);
vm.runInContext(app.slice(start, end), context);
const markupStart = app.indexOf("function taskQueueErrorMarkup(");
const markupEnd = app.indexOf("function moveQueuedTask(");
context.escapeHtml = value => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;");
vm.runInContext(app.slice(markupStart, markupEnd), context);

function response(status, body, ok = status >= 200 && status < 300) {
  return { status, ok, text: async () => body };
}

test("AGToken 524 text response keeps the real timeout error", async () => {
  await assert.rejects(
    context.parseAgtokenImageResponse(response(524, "error code: 524")),
    error => /生成超时（HTTP 524）/.test(error.message) && /下载图片后拖回画布/.test(error.message) && /避免重复扣费/.test(error.message)
  );
});

test("AGToken JSON errors and successful payloads remain supported", async () => {
  await assert.rejects(
    context.parseAgtokenImageResponse(response(400, JSON.stringify({ error: { message: "参数错误" } }))),
    /参数错误/
  );
  const payload = { data: [{ url: "https://example.test/image.png" }] };
  assert.deepEqual(
    JSON.parse(JSON.stringify(await context.parseAgtokenImageResponse(response(200, JSON.stringify(payload))))),
    payload
  );
});

test("only unknown-result AGToken timeouts show the account check link", () => {
  const timeoutMarkup = context.taskQueueErrorMarkup("AGToken 生成超时（HTTP 524）：任务结果未知");
  assert.match(timeoutMarkup, /href="https:\/\/agtoken\.vip\/usage-logs\/task"/);
  assert.match(timeoutMarkup, /检查是否已生成/);
  assert.doesNotMatch(context.taskQueueErrorMarkup("参数错误"), /agtoken\.vip/);
});

test("channel fallback triggers only for gpt-image-2 with No available channel errors", () => {
  const channelError = "No available channel for model gpt-image-2-2k under group default (distributor) (request id: 202611121516005285669408268d9d67qrLFpd1)";
  assert.equal(context.agtokenChannelFallbackModelId(channelError, "gpt-image-2"), "gpt-image-2官渠");
  assert.equal(context.agtokenChannelFallbackModelId("no available channel for model gpt-image-2-1k", "gpt-image-2"), "gpt-image-2官渠");
  assert.equal(context.agtokenChannelFallbackModelId(channelError, "gpt-image-2.5-flare"), "", "other models have no fallback target");
  assert.equal(context.agtokenChannelFallbackModelId("agtoken 接口连接失败 ← The SSL connection could not be established", "gpt-image-2"), "", "network errors must not switch models");
  assert.equal(context.agtokenChannelFallbackModelId("", "gpt-image-2"), "");
  assert.equal(context.agtokenChannelFallbackModelId(undefined, "gpt-image-2"), "");
});

test("gpt-image-2 2K submissions take the official-channel route, other tiers stay put", () => {
  assert.equal(context.agtokenSubmitModelId("gpt-image-2", "2k"), "gpt-image-2官渠");
  assert.equal(context.agtokenSubmitModelId("gpt-image-2", "2K"), "gpt-image-2官渠");
  assert.equal(context.agtokenSubmitModelId("gpt-image-2", "1k"), "gpt-image-2", "普通档位仍用原模型");
  assert.equal(context.agtokenSubmitModelId("gpt-image-2", ""), "gpt-image-2");
  assert.equal(context.agtokenSubmitModelId("gpt-image-2.5-flare", "2k"), "gpt-image-2.5-flare");
  assert.equal(context.agtokenSubmitModelId("gpt-image-2官渠", "2k"), "gpt-image-2官渠");
});
