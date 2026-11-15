const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("browser task protocol carries text kind through both backends", () => {
  const server = read("server.js");
  const desktop = read("desktop-dotnet/DesktopApi.cs");
  assert.match(server, /kind:\s*payload\.kind === "text" \? "text" : "image"/);
  assert.match(server, /kind:\s*task\.kind \|\| "image"/);
  assert.match(desktop, /\["kind"\].*== "text" \? "text" : "image"/);
  assert.match(desktop, /kind = found\["kind"\].*\?\? "image"/);
});

test("extension keeps task tabs in the background and harvests text replies", () => {
  const background = read("browser-extension/background.js");
  const content = read("browser-extension/content.js");
  assert.match(background, /chrome\.tabs\.create\(\{ url, active: false \}\)/);
  assert.doesNotMatch(background, /chrome\.tabs\.update\(sender\.tab\.id, \{ active: true \}\)/);
  assert.match(content, /task\.kind === "text"/);
  assert.match(content, /waitForTextResult\(beforeReplies\)/);
  assert.match(content, /replySel/);
  assert.match(content, /function buildReplySelector/);
  assert.match(content, /buildReplySelector\(element\)/);
  assert.match(content, /CALIBRATION_TEST_PROMPT/);
  assert.match(content, /fillPrompt\(element, CALIBRATION_TEST_PROMPT\)/);
  assert.match(content, /element\.click\(\)/);
});

test("CanvasFlow exposes browser prompt optimization and closes the node entry with the master switch", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /id="browserExtensionEnabledToggle"/);
  assert.match(html, /id="browserPromptOptimizationToggle"/);
  assert.match(html, /id="browserPromptPageUrl"/);
  assert.match(html, /id="browserPromptPageUrlSaveBtn"/);
  assert.match(app, /requestBrowserPromptOptimization/);
  assert.match(app, /const useBrowser = browserPromptOptimizationEnabled\(\)/);
  assert.match(app, /requestBrowserPromptOptimization\(originalText, "image"\)/);
  assert.match(app, /requestPromptOptimization\(originalText, "image", model\.id\)/);
  assert.doesNotMatch(app.slice(app.indexOf("function openPromptOptimizer"), app.indexOf("// 浏览器生图节点")), /prompt-optimizer-overlay/);
  assert.match(app, /state\.settings\.showBrowserNodeMenu = enabled/);
  assert.match(app, /document\.activeElement !== els\.browserPromptPageUrl/);
  assert.match(app, /browserPromptPageUrlSave\.onclick = saveBrowserPromptPageUrl/);
  assert.match(app, /浏览器插件功能已关闭/);
});
