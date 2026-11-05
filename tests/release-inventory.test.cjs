const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Windows publish ships every Local SD browser module loaded by index.html", () => {
  const index = read("index.html");
  const project = read("desktop-dotnet/CanvasFlow.Desktop.csproj");
  for (const file of ["sd-workflow-templates.js", "local-sd.js"]) {
    assert.match(index, new RegExp(`modules/${file.replace(".", "\\.")}`));
    assert.match(project, new RegExp(`modules\\\\${file.replace(".", "\\.")}`));
  }
});

test("mac package ships Local SD browser modules and server dependencies", () => {
  const build = read("build-mac.ps1");
  for (const file of ["sd-workflow-templates.js", "local-sd.js", "browser-transfer-server.js", "comfyui-server.js"]) {
    assert.match(build, new RegExp(`modules\\\\${file.replace(".", "\\.")}`));
  }
});

test("web update inventory follows the current entry page", () => {
  const build = read("build-web-update.ps1");
  assert.match(build, /modules\/sd-workflow-templates\.js/);
  assert.match(build, /modules\/local-sd\.js/);
  assert.doesNotMatch(build, /modules\/mindmap-module\.js/);
});
