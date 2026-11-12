const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("all canvas brush editors share one bracket size shortcut implementation", () => {
  const app = read("app.js");
  const manual = read("modules/manual-matting.js");
  const localSd = read("modules/local-sd.js");

  // 唯一实现：app.js 的 adjustRangeByBracketKey（含全角【 】与步长覆盖）
  assert.match(app, /function adjustRangeByBracketKey\(event, input, stepOverride\)[\s\S]*BracketLeft[\s\S]*【[\s\S]*BracketRight/);
  // 灯箱画笔：window keydown 接入统一函数，仅画笔类工具生效、步长 4
  assert.match(app, /lightboxPainting && isLightboxBrushTool\(lightboxPaintMode\) && adjustRangeByBracketKey\(ev, els\.lightboxPaintSize, 4\)\) return;/);
  // 取色蒙版：dialog keydown 接入统一函数
  assert.match(app, /dialog\.addEventListener\("keydown", event => adjustRangeByBracketKey\(event, dialog\.querySelector\("\[data-mask-size\]"\)\)\)/);
  // 灯箱 size 滑块的 input 监听负责每模式记忆与笔刷圆环同步（统一函数经 input 事件广播）
  assert.match(app, /els\.lightboxPaintSize\.addEventListener\("input"[\s\S]*lightboxPaintSizes\[lightboxPaintMode\][\s\S]*syncLightboxBrushRing/);
  // 不允许再出现灯箱专用第二实现
  assert.ok(!app.includes("handleLightboxBrushSizeShortcut"), "lightbox must reuse adjustRangeByBracketKey, not a second implementation");
  // 局部重绘蒙版两处：模块内不再内联 Bracket 逻辑，统一调用 app.js 实现
  assert.match(localSd, /overlay\.addEventListener\("keydown", event => \{ window\.adjustRangeByBracketKey\?\.\(event, overlay\.querySelector\("\.mm-size"\)\); \}\)/);
  assert.ok(!localSd.includes("BracketLeft"), "local-sd must not inline bracket handling");
  assert.match(manual, /window\.adjustRangeByBracketKey\?\.\(event, dialog\.querySelector\("\.mm-size"\)\)\) return;/);
  assert.ok(!manual.includes("BracketLeft"), "manual-matting must not inline bracket handling");
});
