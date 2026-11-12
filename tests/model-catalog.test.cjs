const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCatalog() {
  const source = fs.readFileSync(path.join(__dirname, "..", "model-catalog.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.CANVASFLOW_MODEL_CATALOG;
}

test("AGToken does not offer the unavailable GPT Image 2 4K channel", () => {
  const catalog = loadCatalog();
  const model = catalog.agtoken.models.find(entry => entry.id === "gpt-image-2");
  assert.deepEqual(Array.from(model.resolutions), ["1k", "2k"]);
});

test("AGToken keeps 4K on image models with supported channels", () => {
  const catalog = loadCatalog();
  for (const id of ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "nano-banana-2", "nano-banana-pro"]) {
    const model = catalog.agtoken.models.find(entry => entry.id === id);
    assert(model.resolutions.includes("4k"), `${id} should keep 4K`);
  }
});

test("AGToken offers the official-channel GPT Image 2 fallback model", () => {
  const catalog = loadCatalog();
  const model = catalog.agtoken.models.find(entry => entry.id === "gpt-image-2官渠");
  assert(model, "gpt-image-2官渠 should exist in the agtoken catalog");
  assert.equal(model.hidden, undefined, "官渠 model stays selectable in the dropdown");
  assert.deepEqual(Array.from(model.resolutions), ["1k", "2k", "4k"]);
  assert.equal(model.quality, false, "官渠 pricing is flat per image; quality param stays off");
});

test("Chat catalog declares per-site default models", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "model-catalog.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const chat = context.window.CANVASFLOW_CHAT_CATALOG;
  assert.deepEqual({ ...chat.siteDefaults }, { apimart: "gpt-6-luna", agtoken: "gemini-3.8-flash" });
});

test("Gemini 3.8 Flash belongs to AGToken and is selectable", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "model-catalog.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const chat = context.window.CANVASFLOW_CHAT_CATALOG;
  const entries = chat.models.filter(entry => entry.id === "gemini-3.8-flash");
  assert.equal(entries.length, 1, "single catalog entry keeps chatModelEntry resolution unambiguous");
  assert.equal(entries[0].apiType, "agtoken");
  assert.equal(entries[0].hidden, undefined, "site default must not be hidden");
  assert.equal(chat.models.some(entry => entry.id === "gemini-3.8-flash" && entry.apiType === "apimart"), false,
    "the old hidden APIMart entry is removed so id matching stays unique");
});
