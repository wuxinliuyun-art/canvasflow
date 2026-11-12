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
