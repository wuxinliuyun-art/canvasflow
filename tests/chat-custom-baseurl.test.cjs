const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("function chatCustomSites()");
const end = source.indexOf("function chatSession", start);
assert.ok(start >= 0 && end > start, "chat model functions should exist in app.js");

function setup(settings) {
  const context = {
    state: { settings: { chatDisabledModels: [], apiKey: "", agtokenApiKey: "", ...settings } },
    window: {},
  };
  vm.runInNewContext(source.slice(start, end) + "\nthis.chatModelEntry = chatModelEntry; this.chatCustomSiteById = chatCustomSiteById; this.chatCatalogModels = chatCatalogModels;", context);
  return context;
}

test("custom site entry resolves the real model name and siteId", () => {
  const ctx = setup({ chatCustomSites: [{ id: "s1", name: "本地站点", baseUrl: "http://127.0.0.1:5323/v1", modelNames: ["my-model"], multimodal: false }] });
  const entry = ctx.chatModelEntry("custom:s1:my-model");
  assert.ok(entry, "custom model should resolve");
  assert.equal(entry.apiType, "custom");
  assert.equal(entry.model, "my-model", "upstream model must be the real name");
  assert.equal(entry.siteId, "s1");
});

test("base url comes from the site table via siteId (never from an entry.site property)", () => {
  const ctx = setup({ chatCustomSites: [{ id: "s1", name: "本地站点", baseUrl: "http://127.0.0.1:5323/v1", modelNames: ["my-model"], multimodal: false }] });
  const entry = ctx.chatModelEntry("custom:s1:my-model");
  const site = ctx.chatCustomSiteById(entry.siteId);
  assert.equal(site.baseUrl, "http://127.0.0.1:5323/v1");
  // 历史缺陷回归锁：entry 上不存在 site 属性，sendChatNodeMessage 不得再读 entry.site?.baseUrl
  assert.equal(entry.site, undefined);
});

test("sendChatNodeMessage resolves the base url through the site table", () => {
  // 静态回归锁：custom 分支必须用 chatCustomSiteById(entry.siteId) 解析 baseUrl
  assert.doesNotMatch(source, /entry\.site\?\.baseUrl/, "dangling entry.site?.baseUrl read must stay removed");
  assert.match(source, /const customSite = chatCustomSiteById\(entry\.siteId\);\s*\n\s*payload\.__chatCustom = \{ baseUrl: String\(customSite\?\.baseUrl \|\| ""\)\.trim\(\), siteId: entry\.siteId \};/);
});

test("sites without base url or model names yield no models", () => {
  const ctx = setup({ chatCustomSites: [{ id: "s2", name: "残缺站点", baseUrl: "", modelNames: ["m"] }, { id: "s3", name: "无模型", baseUrl: "http://x/v1", modelNames: [] }] });
  assert.equal(ctx.chatCatalogModels().length, 0);
});
