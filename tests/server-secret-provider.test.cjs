const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const https = require("node:https");
const { startCanvasFlowServer } = require("../server");

// Desktop shells (mac main.js getApiKey / Windows DesktopApi secrets) supply the upstream
// key server-side: the desktop frontend deliberately omits keys on /api/generate and
// /api/chat/completions. Capture what proxyRequest actually sends upstream.
const captured = [];
const realRequest = https.request;
https.request = function fakeRequest(options, callback) {
  captured.push({ host: options.hostname, path: options.path, authorization: (options.headers && options.headers.Authorization) || "" });
  const request = new EventEmitter();
  request.write = () => { };
  request.end = () => { };
  request.setTimeout = () => { };
  request.destroy = () => { };
  process.nextTick(() => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = { "content-type": "application/json" };
    callback(response);
    response.emit("data", Buffer.from(JSON.stringify({ proxied: true })));
    response.emit("end");
  });
  return request;
};

async function startFixture() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvasflow-secret-test-"));
  const previousAppData = process.env.APPDATA;
  process.env.APPDATA = temporaryRoot; // Never overwrite the running desktop's discovery file.
  const instance = await startCanvasFlowServer({
    dataRoot: temporaryRoot,
    port: "0",
    getApiKey: apiType => (apiType === "agtoken" ? "sk-agtoken-fallback" : "sk-apimart-fallback"),
  });
  return { instance, restore: () => { process.env.APPDATA = previousAppData; } };
}

function post(url, body, headers = {}) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

test("desktop-mode generation falls back to the slotted secret when no key travels with the request", async t => {
  const { instance, restore } = await startFixture();
  t.after(async () => { await instance.close(); restore(); });
  const base = instance.url;

  captured.length = 0;
  await post(base + "api/generate", { model: "gpt-image-2", prompt: "cat" });
  assert.equal(captured[0].host, "api.apib.ai");
  assert.equal(captured[0].authorization, "Bearer sk-apimart-fallback");

  await post(base + "api/midjourney/generate", { prompt: "cat", version: "8.2" });
  assert.equal(captured[1].authorization, "Bearer sk-apimart-fallback");

  await post(base + "api/chat/completions", { model: "gemini-3.8-flash", messages: [] });
  assert.equal(captured[2].authorization, "Bearer sk-apimart-fallback");
  await post(base + "api/chat/completions", { apiType: "agtoken", model: "gpt-6-sol", messages: [] });
  assert.equal(captured[3].host, "agtoken.vip");
  assert.equal(captured[3].authorization, "Bearer sk-agtoken-fallback");

  await post(base + "api/agtoken/generate", { model: "gpt-image-2", prompt: "cat" });
  assert.equal(captured[4].host, "agtoken.vip");
  assert.equal(captured[4].authorization, "Bearer sk-agtoken-fallback");
  await post(base + "api/agtoken/edits", { model: "gpt-image-2", prompt: "cat", images: [] });
  assert.equal(captured[5].authorization, "Bearer sk-agtoken-fallback");
});

test("explicit keys still win: request header over secret, request body over secret", async t => {
  const { instance, restore } = await startFixture();
  t.after(async () => { await instance.close(); restore(); });
  const base = instance.url;

  captured.length = 0;
  await post(base + "api/generate", { model: "gpt-image-2", prompt: "cat" }, { "X-CanvasFlow-Api-Key": "sk-header-wins" });
  assert.equal(captured[0].authorization, "Bearer sk-header-wins");

  await post(base + "api/generate", { model: "gpt-image-2", prompt: "cat", _apiKey: "sk-body-wins" });
  assert.equal(captured[1].authorization, "Bearer sk-body-wins");
  await post(base + "api/agtoken/generate", { model: "gpt-image-2", prompt: "cat", _apiKey: "sk-agtoken-body" });
  assert.equal(captured[2].authorization, "Bearer sk-agtoken-body");

  await fetch(base + "api/task/task-123", { headers: { "X-CanvasFlow-Api-Key": "sk-header-wins" } });
  assert.equal(captured[3].path, "/v1/tasks/task-123");
  assert.equal(captured[3].authorization, "Bearer sk-header-wins");
  await fetch(base + "api/task/task-123");
  assert.equal(captured[4].authorization, "Bearer sk-apimart-fallback");
});

test("ai-video routes: apimart submits to /v1/videos/generations and polls /v1/tasks, agtoken keeps its own endpoint", async t => {
  const { instance, restore } = await startFixture();
  t.after(async () => { await instance.close(); restore(); });
  const base = instance.url;

  captured.length = 0;
  // apimart 视频提交：走镜像 failover 首选 host，body._apiKey 优先，剥离后不透传
  await post(base + "api/apimart/video-generate", { model: "MiniMax-H3", prompt: "cat", _apiKey: "sk-video-body" });
  assert.equal(captured[0].host, "api.apib.ai");
  assert.equal(captured[0].path, "/v1/videos/generations");
  assert.equal(captured[0].authorization, "Bearer sk-video-body");

  // 无 body key 时回落 apimart 槽（mac getApiKey / Windows secrets 语义）
  await post(base + "api/apimart/video-generate", { model: "MiniMax-H3-Max", prompt: "cat" });
  assert.equal(captured[1].authorization, "Bearer sk-apimart-fallback");

  // 任务号形如 task_01J9…（含下划线），查询走与绘图相同的 /v1/tasks 端点
  const poll = await fetch(base + "api/apimart/video-task/task_01J9HA7JPQ9A0Z6JZ3V8M9W6PZ");
  assert.equal(poll.status, 200);
  assert.equal(captured[2].path, "/v1/tasks/task_01J9HA7JPQ9A0Z6JZ3V8M9W6PZ");
  assert.equal(captured[2].authorization, "Bearer sk-apimart-fallback");

  // 非法任务号（含斜杠等）拒绝
  const bad = await fetch(base + "api/apimart/video-task/" + encodeURIComponent("bad/id"));
  assert.equal(bad.status, 400);

  // agtoken 视频链路回归：仍走 /v1/video/generations 与 agtoken 槽（非法任务号不发上游,故此处是第 4 条捕获）
  await post(base + "api/agtoken/video-generate", { model: "doubao-seedance-2-0-260128（国内）", prompt: "cat" });
  assert.equal(captured[3].host, "agtoken.vip");
  assert.equal(captured[3].path, "/v1/video/generations");
  assert.equal(captured[3].authorization, "Bearer sk-agtoken-fallback");
});
