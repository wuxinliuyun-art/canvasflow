const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const https = require("node:https");
const { startCanvasFlowServer } = require("../server");

// 自定义 OpenAI 兼容站点透传：/api/chat/completions 的 custom 分支与 /api/chat-custom/models。
// 截获 server 实际发出的 http/https 请求，断言目标地址、Authorization 与清洗后的 payload。
const captured = [];
const realHttpRequest = http.request;
const realHttpsRequest = https.request;
function installFakeRequest() {
  const fake = function fakeRequest(options, callback) {
    const record = {
      host: options.hostname,
      port: options.port,
      path: options.path,
      authorization: (options.headers && options.headers.Authorization) || "",
      body: "",
    };
    captured.push(record);
    const request = new EventEmitter();
    request.write = chunk => { record.body += chunk; };
    request.end = () => { };
    request.setTimeout = () => { };
    request.destroy = () => { };
    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { "content-type": "application/json" };
      callback(response);
      response.emit("data", Buffer.from(JSON.stringify({ proxied: true, choices: [{ message: { content: "ok" } }] })));
      response.emit("end");
    });
    return request;
  };
  http.request = fake;
  https.request = fake;
  return () => { http.request = realHttpRequest; https.request = realHttpsRequest; };
}

async function startFixture() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvasflow-chatcustom-test-"));
  const previousAppData = process.env.APPDATA;
  process.env.APPDATA = temporaryRoot; // Never overwrite the running desktop's discovery file.
  const instance = await startCanvasFlowServer({
    dataRoot: temporaryRoot,
    port: "0",
    // 只对确实配置过的槽返回值（真实 secrets 里未配置的槽读出来是空）
    getApiKey: apiType => (apiType === "agtoken" ? "sk-agtoken-fallback" : apiType === "chatcustom:cs2" ? "sk-slot-cs2" : apiType === "apimart" ? "sk-apimart-fallback" : ""),
  });
  return { instance, restore: () => { process.env.APPDATA = previousAppData; } };
}

function post(url, body, headers = {}) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

test("custom chat routes to the user base URL over http with the real model name and a cleaned payload", async t => {
  const restore = installFakeRequest();
  t.after(restore);
  const { instance, restore: restoreEnv } = await startFixture();
  t.after(async () => { await instance.close(); restoreEnv(); });
  const base = instance.url;

  captured.length = 0;
  const payload = {
    apiType: "custom",
    model: "custom:cs1:qwen2.5:7b",
    stream: false,
    messages: [{ role: "user", content: "hi" }],
    __chatCustom: { baseUrl: "http://127.0.0.1:11434/v1", siteId: "cs1" },
    _apiKey: "sk-custom-key",
  };
  const resp = await post(base + "api/chat/completions", payload);
  assert.equal(resp.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].host, "127.0.0.1");
  assert.equal(String(captured[0].port), "11434");
  assert.equal(captured[0].path, "/v1/chat/completions");
  assert.equal(captured[0].authorization, "Bearer sk-custom-key");
  const forwarded = JSON.parse(captured[0].body);
  assert.equal(forwarded.model, "qwen2.5:7b"); // 冒号模型名完整保留：id 前两段剥站点，余下全为模型名
  assert.equal(forwarded.apiType, undefined);
  assert.equal(forwarded._apiKey, undefined);
  assert.equal(forwarded.__chatCustom, undefined);
  assert.deepEqual(forwarded.messages, [{ role: "user", content: "hi" }]);
});

test("custom chat without a body key falls back to the chatcustom:<siteId> secret slot; missing key omits Authorization", async t => {
  const restore = installFakeRequest();
  t.after(restore);
  const { instance, restore: restoreEnv } = await startFixture();
  t.after(async () => { await instance.close(); restoreEnv(); });
  const base = instance.url;

  captured.length = 0;
  await post(base + "api/chat/completions", {
    apiType: "custom",
    model: "custom:cs2:llama3",
    messages: [],
    __chatCustom: { baseUrl: "http://127.0.0.1:11434/v1", siteId: "cs2" },
  });
  assert.equal(captured[0].authorization, "Bearer sk-slot-cs2");

  captured.length = 0;
  const noSlot = await post(base + "api/chat/completions", {
    apiType: "custom",
    model: "custom:cs-none:m",
    messages: [],
    __chatCustom: { baseUrl: "http://127.0.0.1:11434/v1", siteId: "cs-none" },
  });
  assert.equal(noSlot.status, 200);
  assert.equal(captured[0].authorization, "");
});

test("custom https base URL keeps port 443 and the trailing slash is normalized", async t => {
  const restore = installFakeRequest();
  t.after(restore);
  const { instance, restore: restoreEnv } = await startFixture();
  t.after(async () => { await instance.close(); restoreEnv(); });
  const base = instance.url;

  captured.length = 0;
  await post(base + "api/chat/completions", {
    apiType: "custom",
    model: "custom:cs3:gpt-x",
    messages: [],
    _apiKey: "k3",
    __chatCustom: { baseUrl: "https://relay.example.com/v1/", siteId: "cs3" },
  });
  assert.equal(captured[0].host, "relay.example.com");
  assert.equal(captured[0].port, 443);
  assert.equal(captured[0].path, "/v1/chat/completions");
});

test("chat-custom/models fetches GET {baseUrl}/models and invalid base URLs are rejected with 502", async t => {
  const restore = installFakeRequest();
  t.after(restore);
  const { instance, restore: restoreEnv } = await startFixture();
  t.after(async () => { await instance.close(); restoreEnv(); });
  const base = instance.url;

  captured.length = 0;
  const ok = await post(base + "api/chat-custom/models", { baseUrl: "http://127.0.0.1:11434/v1", siteId: "cs9", _apiKey: "k9" });
  assert.equal(ok.status, 200);
  assert.equal(captured[0].host, "127.0.0.1");
  assert.equal(String(captured[0].port), "11434");
  assert.equal(captured[0].path, "/v1/models");
  assert.equal(captured[0].authorization, "Bearer k9");

  const noProtocol = await post(base + "api/chat-custom/models", { baseUrl: "127.0.0.1:11434/v1" });
  assert.equal(noProtocol.status, 502);
  const badScheme = await post(base + "api/chat-custom/models", { baseUrl: "ftp://example.com/v1" });
  assert.equal(badScheme.status, 502);
});
