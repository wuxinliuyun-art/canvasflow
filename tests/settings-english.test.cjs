const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const dictionary = app.slice(app.indexOf('const UI_EN ='), app.indexOf('let uiLanguage ='));
const functions = app.slice(app.indexOf('function translateEnglishString('), app.indexOf('function translateUiTree('));
const translate = new Function(`${dictionary}\nlet uiLanguage = 'en';\n${functions}\nreturn translateEnglishString;`)();
test('截图中常规设置、菜单管理和模型管理的文案均可翻译', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ids = ['aiResultAsImageNodeToggle', 'showLocalSdNodeMenuToggle', 'imageModelCardToggle'];
  for (const id of ids) {
    const tag = html.match(new RegExp(`id="${id}"[^>]*>([^<]*)`));
    if (tag?.[1]?.trim()) assert.doesNotMatch(translate(tag[1].trim()), /[\u4e00-\u9fff]/);
  }
  for (const source of ['AI 绘图结果新建图片节点并连线', '显示本地 SD 节点', '右键菜单管理', '画布空白处', '添加调色盘', '添加本地 SD 节点', '全部恢复显示', '模型管理', '全不选', '全部取消勾选，再勾选需要的模型']) {
    assert.doesNotMatch(translate(source), /[\u4e00-\u9fff]/, source);
  }
  for (const hint of html.matchAll(/<(?:div class="hint"|p class="setting-desc")>([^<]+)<\//g)) {
    if (/单张结果|取消勾选可隐藏|勾选后才会出现/.test(hint[1])) assert.doesNotMatch(translate(hint[1]), /[\u4e00-\u9fff]/, hint[1]);
  }
});
test('两站绘图模型名称和说明可翻译，模型标识不变', () => {
  const window = {};
  new Function('window', fs.readFileSync(path.join(root, 'model-catalog.js'), 'utf8'))(window);
  const catalog = window.CANVASFLOW_MODEL_CATALOG;
  assert.ok(catalog);
  for (const site of Object.values(catalog)) for (const model of site.models || []) {
    assert.doesNotMatch(translate(model.label), /[\u4e00-\u9fff]/, model.label);
    if (model.note) assert.doesNotMatch(translate(model.note), /[\u4e00-\u9fff]/, model.note);
  }
});
