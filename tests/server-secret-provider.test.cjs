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
  captured.push({ host: options.hostname, path: options.path, authorization: (options.headers && options.headers.Authorization) || "", contentType: (options.headers && options.headers["Content-Type"]) || "", headers: options.headers });
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

test("agtoken seedance-task routes: Ark-compat passthrough to /api/v3/contents/generations/tasks with agtoken slot", async t => {
  const { instance, restore } = await startFixture();
  t.after(async () => { await instance.close(); restore(); });
  const base = instance.url;

  captured.length = 0;
  // 提交：body._apiKey 优先，剥离后不透传；上游为 Seedance 兼容接口（火山方舟同构，透传不转换）
  await post(base + "api/agtoken/seedance-task", {
    model: "doubao-seedance-2-5-260628（国内）",
    content: [{ type: "text", text: "cat" }, { type: "video_url", video_url: { url: "https://cdn.example/r.mp4" }, role: "reference_video" }],
    duration: 5,
    _apiKey: "sk-seedance-body",
  });
  assert.equal(captured[0].host, "agtoken.vip");
  assert.equal(captured[0].path, "/api/v3/contents/generations/tasks");
  assert.equal(captured[0].authorization, "Bearer sk-seedance-body");

  // 无 body key 回落 agtoken 槽（mac getApiKey / Windows secrets 语义）
  await post(base + "api/agtoken/seedance-task", { model: "doubao-seedance-2-0-260128（国内）", content: [] });
  assert.equal(captured[1].authorization, "Bearer sk-agtoken-fallback");

  // 查询与提交同前缀；任务号 task_xxx（含下划线）原样透传
  const poll = await fetch(base + "api/agtoken/seedance-task/task_01J9HA7JPQ9A0Z6JZ3V8M9W6PZ");
  assert.equal(poll.status, 200);
  assert.equal(captured[2].path, "/api/v3/contents/generations/tasks/task_01J9HA7JPQ9A0Z6JZ3V8M9W6PZ");
  assert.equal(captured[2].authorization, "Bearer sk-agtoken-fallback");

  // 非法任务号拒绝且不发上游
  const bad = await fetch(base + "api/agtoken/seedance-task/" + encodeURIComponent("bad/id"));
  assert.equal(bad.status, 400);
  assert.equal(captured.length, 3, "非法任务号不发上游");
});

test("video-reference upload route: filePath/base64 multipart to /v1/uploads/videos with slotted key", async t => {
  const { instance, restore } = await startFixture();
  t.after(async () => { await instance.close(); restore(); });
  const base = instance.url;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvasflow-videoref-"));
  const videoPath = path.join(tmpDir, "ref.mp4");
  fs.writeFileSync(videoPath, Buffer.from("fake-mp4-bytes"));

  captured.length = 0;
  // filePath 模式：_apiKey 优先，multipart 直达 apimart 上传接口，固定 3 天档
  const first = await post(base + "api/apimart/video-upload", { filePath: videoPath, fileName: "ref.mp4", _apiKey: "sk-upload-body" });
  assert.equal(first.status, 502, "fake 上游无 url → 归一为 502（不是 404，路由已注册）");
  assert.equal(captured[0].host, "api.apimart.ai");
  assert.equal(captured[0].path, "/v1/uploads/videos?retention_days=3");
  assert.equal(captured[0].authorization, "Bearer sk-upload-body");
  assert.ok(/^multipart\/form-data; boundary=/.test(captured[0].contentType), "multipart Content-Type 覆盖默认 JSON");

  // 无 body key 回落 apimart 槽
  await post(base + "api/apimart/video-upload", { filePath: videoPath, fileName: "ref.mp4" });
  assert.equal(captured[1].authorization, "Bearer sk-apimart-fallback");

  // base64 模式（浏览器拖拽拿不到路径）：dataURL 前缀剥掉再解码
  await post(base + "api/apimart/video-upload", { fileName: "clip.webm", base64: "data:video/webm;base64,dGVzdA==" });
  assert.equal(captured[2].path, "/v1/uploads/videos?retention_days=3");

  // 前置校验：缺来源 / 扩展名白名单外 → 400 且不发上游
  const missing = await post(base + "api/apimart/video-upload", { fileName: "ref.mp4" });
  assert.equal(missing.status, 400);
  const badExt = await post(base + "api/apimart/video-upload", { filePath: videoPath.replace(/mp4$/, "avi"), fileName: "ref.avi" });
  assert.equal(badExt.status, 400);
  assert.equal(captured.length, 3, "前置拒绝不发上游");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
