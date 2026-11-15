const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("browser, local SD and extension nodes expose one shared help entry", () => {
  assert.match(app, /node\.type === "browser-image" \|\| node\.type === "local-sd" \|\| node\.type === "tool-node"/);
  assert.match(app, /data-role="node-help"/);
  assert.match(app, /if \(actionRole === "node-help"\)/);
  assert.match(css, /\.node-help-button\s*\{/);
});

test("node help explains setup and opens the matching extension section", () => {
  for (const id of ["browserExtensionSection", "pythonExtensionSection", "localSdExtensionSection"]) {
    assert.ok(html.includes(`id="${id}"`), `${id} must exist`);
    assert.ok(app.includes(`"${id}"`), `${id} must be routed from node help`);
  }
  assert.match(app, /confirmText: "打开拓展设置"/);
  assert.match(app, /文件可用.*不代表浏览器已经安装或站点已经连接/);
  // 本地 SD 帮助文案随"先选工作流"重构更新（2026-11-14）
  assert.match(app, /先选工作流，节点按工作流需要自动生成输入项/);
  assert.match(app, /图片取第一张上游图/);
});

test("browser plugin folder button opens the parent so the whole folder can be dragged", () => {
  assert.match(app, /function parentFolderPath\(folderPath\)/);
  assert.match(app, /openOutputFolder\(parentFolderPath\(directory\)\)/);
});

test("browser help ships the privacy-clean Chrome, Edge and CanvasFlow tutorial images", () => {
  for (const file of ["canvasflow-open-folder.png", "chrome-install.png", "edge-install.png"]) {
    assert.ok(app.includes(`assets/browser-extension-help/${file}`), `${file} must be referenced`);
    assert.ok(fs.existsSync(path.join(root, "assets", "browser-extension-help", file)), `${file} must ship`);
  }
  assert.doesNotMatch(app, /Brave|Vivaldi|Opera \/ Opera GX|Arc（Windows）/);
  assert.match(app, /360 极速浏览器、360 安全浏览器/);
});

