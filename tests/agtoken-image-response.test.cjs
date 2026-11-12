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
