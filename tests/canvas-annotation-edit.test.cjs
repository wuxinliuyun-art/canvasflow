// 画布文字标注（备注）再次编辑修复回归：2026-11-27
// 根因：标注编辑态是 contenteditable="plaintext-only"，画布三处焦点/交互守卫只匹配
// [contenteditable='true']，编辑中的标注点击被当成空白画布处理——捕获阶段 pointerdown 与
// viewport mousedown 抢走焦点触发 focusout 立即提交，编辑框闪现即关，观感是"没有输入框"。
// 本文件锁定四处修复的接线，防止守卫选择器被改回。
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("捕获阶段 pointerdown 放行标注，不再抢焦点打断编辑", () => {
  const idx = app.indexOf('els.viewport.addEventListener("pointerdown"');
  assert.ok(idx > 0, "viewport pointerdown capture listener must exist");
  const block = app.slice(idx, idx + 400);
  assert.ok(
    block.includes("[contenteditable='plaintext-only'],.canvas-annotation"),
    "capture pointerdown guard must skip plaintext-only annotations",
  );
});

test("viewport mousedown 对编辑中的标注提前返回（不抢焦点、不启动框选）", () => {
  const guard = app.indexOf('if (ev.target.closest(".canvas-annotation.is-editing")) return;');
  assert.ok(guard > 0, "editing-annotation early return missing in viewport mousedown");
  // 必须在空白画布分支的 focus/框选逻辑之前生效
  const focusSteal = app.indexOf("if (!interactive) els.viewport.focus();");
  const blankBranch = app.indexOf("selectionDraft = { start: p, end: p };");
  assert.ok(guard < focusSteal, "early return must precede viewport focus steal");
  assert.ok(guard < blankBranch, "early return must precede marquee selection start");
});

test("标注层 dblclick 已在编辑中时交给原生双击选词", () => {
  assert.ok(
    app.includes("if (el.isContentEditable) return; // 已在编辑中：不吞原生双击选词"),
    "annotation dblclick must not swallow native word selection while editing",
  );
});

test("再次编辑时 startAnnotationEdit 把光标放到文字末尾", () => {
  const fnStart = app.indexOf("function startAnnotationEdit(");
  const fnEnd = app.indexOf("function commitAnnotationEdit(");
  assert.ok(fnStart > 0 && fnEnd > fnStart, "startAnnotationEdit must exist");
  const body = app.slice(fnStart, fnEnd);
  assert.ok(body.includes("range.collapse(false);"), "re-edit caret must collapse to text end");
  assert.ok(body.includes('el.contentEditable = "plaintext-only";'), "keep plaintext-only editing host");
});

test("?v= 基线：app.js=20261127-composerpick1，styles.css 维持 parallelhelp2", () => {
  assert.ok(html.includes("app.js?v=20261127-composerpick1"), "app.js version must be bumped");
  assert.ok(!html.includes("app.js?v=20261127-modelretire1"), "stale app.js version must be replaced");
  assert.ok(html.includes("styles.css?v=20261127-parallelhelp2"), "styles.css version must match");
});
