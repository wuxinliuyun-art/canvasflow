const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Windows publish ships every Local SD browser module loaded by index.html", () => {
  const index = read("index.html");
  const project = read("desktop-dotnet/CanvasFlow.Desktop.csproj");
  for (const file of ["local-sd.js", "image-annotations.js"]) {
    assert.match(index, new RegExp(`modules/${file.replace(".", "\\.")}`));
    assert.match(project, new RegExp(`modules\\\\${file.replace(".", "\\.")}`));
  }
  // 内置工作流模板已整体下线（2026-11-14），不得再进发布清单
  assert.ok(!index.includes("sd-workflow-templates"));
  assert.ok(!project.includes("sd-workflow-templates"));
});

test("mac package ships Local SD browser modules and server dependencies", () => {
  const build = read("build-mac.ps1");
  for (const file of ["local-sd.js", "image-annotations.js", "browser-transfer-server.js", "comfyui-server.js"]) {
    assert.match(build, new RegExp(`modules\\\\${file.replace(".", "\\.")}`));
  }
  assert.ok(!build.includes("sd-workflow-templates"));
});

test("web update inventory follows the current entry page", () => {
  const build = read("build-web-update.ps1");
  assert.match(build, /modules\/local-sd\.js/);
  assert.match(build, /modules\/image-annotations\.js/);
  assert.ok(!build.includes("sd-workflow-templates"));
  assert.doesNotMatch(build, /modules\/mindmap-module\.js/);
});

test("all release formats ship browser extension help images", () => {
  const csproj = read("desktop-dotnet/CanvasFlow.Desktop.csproj");
  const mac = read("build-mac.ps1");
  const web = read("build-web-update.ps1");
  for (const file of ["canvasflow-open-folder.png", "chrome-install.png", "edge-install.png"]) {
    assert.match(csproj, /assets\\browser-extension-help\\\*\.png/);
    assert.ok(mac.includes(`assets\\browser-extension-help\\${file}`));
    assert.ok(web.includes(`assets/browser-extension-help/${file}`));
  }
});

test("all release formats ship the ORT jsep wasm artifacts (non-jsep pair retired)", () => {
  // ort.min.js 1.23.2 官方默认构建即 JSEP 版，运行时只动态 import .jsep.* 产物；
  // 非 jsep 两个文件（约 12MB）已从 vendor 目录删除，三个打包清单同步换名（2026-11-14）
  const csproj = read("desktop-dotnet/CanvasFlow.Desktop.csproj");
  const mac = read("build-mac.ps1");
  const web = read("build-web-update.ps1");
  for (const file of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
    assert.ok(fs.existsSync(path.join(root, "assets", "vendor", "onnxruntime", file)), `${file} must exist on disk`);
    assert.ok(mac.includes(`assets\\vendor\\onnxruntime\\${file}`), `build-mac.ps1 must ship ${file}`);
    assert.ok(web.includes(`assets/vendor/onnxruntime/${file}`), `build-web-update.ps1 must ship ${file}`);
  }
  assert.match(csproj, /assets\\vendor\\onnxruntime\\\*\.\*/);
  // 旧非 jsep 产物名不得再进清单（jsep 文件名含 .jsep.，不会被这两条误伤）
  assert.ok(!mac.includes("ort-wasm-simd-threaded.mjs"));
  assert.ok(!web.includes("ort-wasm-simd-threaded.mjs"));
});

test("all release formats ship the builtin ONNX models", () => {
  // u2netp = 自动抠图；informative-drawings-lineart = 灯箱提取线稿（2026-11-15 替换像素算法）
  const csproj = read("desktop-dotnet/CanvasFlow.Desktop.csproj");
  const mac = read("build-mac.ps1");
  const web = read("build-web-update.ps1");
  for (const file of ["u2netp.onnx", "informative-drawings-lineart.onnx"]) {
    assert.ok(fs.existsSync(path.join(root, "assets", "models", file)), `${file} must exist on disk`);
    assert.ok(csproj.includes(`assets\\models\\${file}`), `csproj must ship ${file}`);
    assert.ok(mac.includes(`assets\\models\\${file}`), `build-mac.ps1 must ship ${file}`);
    assert.ok(web.includes(`assets/models/${file}`), `build-web-update.ps1 must ship ${file}`);
  }
});

test("dev-flag.js is a source-tree-only file and never ships in any release", () => {
  // dev-flag.js 置位 window.CANVASFLOW_DEV（编组运行按钮等开发专用 UI 的门控），
  // 发布清单收录它会让开发 UI 泄漏进发布版——三个打包入口都不得出现（2026-11-14）
  for (const file of ["desktop-dotnet/CanvasFlow.Desktop.csproj", "build-mac.ps1", "build-web-update.ps1"]) {
    assert.ok(!read(file).includes("dev-flag.js"), `${file} must not ship dev-flag.js`);
  }
  const index = read("index.html");
  assert.match(index, /<script src="dev-flag\.js"><\/script>/);
  assert.ok(fs.existsSync("dev-flag.js"), "dev-flag.js must exist in the source tree");
});
