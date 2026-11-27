// 右键菜单「添加本地 SD 节点」「添加截图功能节点」改常闭（2026-11-27 用户要求）：
// ① 两处 settings 默认值翻转为 false；② restoreData 一次性迁移旧存档沿袭的 true（_menuDefaultClosedMigrated 标记，
//    用户迁移后重新勾选的 true 不再被改动）；③ 外观「右键菜单管理」与常规页开关仍可随时勾回。
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("settings 默认值：本地 SD 与截图功能入口默认关闭，且仅两处默认字面量", () => {
  const defaults = app.match(/showLocalSdNodeMenu: false, showScreenshotNodeMenu: false/g) || [];
  assert.strictEqual(defaults.length, 2, "initial state + restoreData 两处默认对象都要翻转");
  assert.ok(!app.includes("showLocalSdNodeMenu: true"), "不得残留 true 默认值");
  assert.ok(!app.includes("showScreenshotNodeMenu: true"), "不得残留 true 默认值");
});

test("restoreData 一次性迁移：仅翻转沿袭默认的 true，带标记不重复执行", () => {
  const marker = app.indexOf("_menuDefaultClosedMigrated");
  assert.ok(marker > 0, "迁移标记缺失");
  const block = app.slice(app.indexOf("!state.settings._menuDefaultClosedMigrated"), marker + 400);
  assert.ok(block.includes("state.settings.showLocalSdNodeMenu === true"), "只翻转显式 true（用户勾回的 false 不动）");
  assert.ok(block.includes("state.settings.showScreenshotNodeMenu === true"), "只翻转显式 true（用户勾回的 false 不动）");
  assert.ok(block.includes('state.settings._menuDefaultClosedMigrated = true;'), "迁移后必须写标记");
});

test("两个入口仍可在右键菜单管理/常规页勾回，菜单守卫键不变", () => {
  assert.ok(app.includes('"添加本地 SD 节点": "showLocalSdNodeMenu"'), "CONTEXT_MENU_FLAG_ITEMS 映射保留");
  assert.ok(app.includes('"添加截图功能节点": "showScreenshotNodeMenu"'), "CONTEXT_MENU_FLAG_ITEMS 映射保留");
  assert.ok(app.includes('"添加本地 SD 节点", "添加截图功能节点"'), "外观右键菜单管理清单保留两项");
  assert.ok(app.includes("state.settings.showLocalSdNodeMenu !== false"), "菜单插入守卫键不变");
  assert.ok(app.includes("state.settings.showScreenshotNodeMenu !== false"), "菜单插入守卫键不变");
});
