const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("// ===== API Key 输入防抖安全保存（移植自个人 v2.7.8 快照） =====");
const end = source.indexOf("els.defaultImageModelSelect.onchange", start);
assert.ok(start >= 0 && end > start, "api key safe input block should exist in app.js");

function fixture(options = {}) {
  const state = { settings: { apiKey: "", agtokenApiKey: "agt-old" } };
  const saves = [];
  let saveDepth = 0;
  const timers = [];
  const context = {
    state,
    activeApiType: () => options.apiType || "apimart",
    activeApiKey: apiType => (apiType === "agtoken" ? state.settings.agtokenApiKey || "" : state.settings.apiKey || ""),
    setActiveApiKey: value => { if (context.activeApiType() === "agtoken") state.settings.agtokenApiKey = value; else state.settings.apiKey = value; },
    desktop: options.desktop === false ? undefined : {
      saveApiKey: async (value, apiType) => {
        // 记录并发深度：串行队列下任何时刻 depth 不应超过 1
        saveDepth++;
        saves.push({ value, apiType, depth: saveDepth });
        await new Promise(resolve => setTimeout(resolve, options.saveDelay ?? 5));
        saveDepth--;
        return { success: true, ...(options.warning ? { warning: options.warning } : {}) };
      },
    },
    els: { apiKeyInput: { value: options.inputValue ?? "", addEventListener() {} } },
    toast: t => (context.toasts ??= []).push(t),
    renderNodes: () => {},
    pushHistory: () => (context.historyCount = (context.historyCount || 0) + 1),
    window: { setTimeout: (fn, ms) => { const id = timers.length + 1; timers.push({ id, fn, ms }); return id; }, clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); }, addEventListener() {} },
  };
  vm.runInNewContext(
    source.slice(start, end) + "\nthis.saveKeyValue = saveApiKeyValue; this.schedule = scheduleApiKeyInputSave; this.flush = flushApiKeyInputSaves;",
    context
  );
  return { context, state, saves, timers };
}

test("防抖保存：input 只排一个定时器，800ms 后写桌面 secrets", async () => {
  const { context, saves, timers } = fixture({ inputValue: "sk-mock-1" });
  context.schedule();
  context.schedule();
  assert.equal(timers.length, 1, "重复 input 复用同一防抖定时器");
  await timers[0].fn();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(saves.length, 1);
  assert.equal(saves[0].value, "sk-mock-1");
  assert.equal(saves[0].apiType, "apimart");
});

test("浏览器模式不做桌面保存（persistPages 剥离，内存值已实时写入）", async () => {
  const { context, saves, timers } = fixture({ desktop: false, inputValue: "sk-mock-2" });
  context.schedule();
  assert.equal(timers.length, 0, "不排桌面保存定时器");
  context.flush();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(saves.length, 0);
});

test("串行队列：并发保存请求不产生交叉读写，密文不被旧值覆盖", async () => {
  const { context, saves } = fixture({ saveDelay: 20 });
  const a = context.saveKeyValue("sk-mock-a", "apimart");
  const b = context.saveKeyValue("sk-mock-b", "apimart");
  await Promise.all([a, b]);
  assert.equal(saves.length, 2);
  assert.ok(saves.every(s => s.depth === 1), "每次 secrets 读改写互不重叠");
  assert.deepEqual(saves.map(s => s.value), ["sk-mock-a", "sk-mock-b"], "按提交顺序串行执行");
});

test("保存失败不重试：队列继续但不会用旧内存值覆盖有效密文", async () => {
  const state = { settings: { apiKey: "", agtokenApiKey: "" } };
  const attempts = [];
  const context = {
    state,
    activeApiType: () => "apimart",
    activeApiKey: () => state.settings.apiKey || "",
    setActiveApiKey: value => { state.settings.apiKey = value; },
    desktop: { saveApiKey: async value => { attempts.push(value); if (attempts.length === 1) throw new Error("DPAPI 不可用"); return { success: true }; } },
    els: { apiKeyInput: { value: "", addEventListener() {} } },
    toast: () => {},
    renderNodes: () => {},
    pushHistory: () => {},
    window: { setTimeout: () => 1, clearTimeout: () => {}, addEventListener() {} },
  };
  vm.runInNewContext(source.slice(start, end) + "\nthis.saveKeyValue = saveApiKeyValue;", context);
  await context.saveKeyValue("sk-first").catch(() => {});
  await context.saveKeyValue("sk-second");
  assert.deepEqual(attempts, ["sk-first", "sk-second"], "失败的保存不自动重试，后续保存正常执行");
});

test("失焦/关闭冲刷：未决防抖立即执行且定时器清空", async () => {
  const { context, saves, timers } = fixture({ inputValue: "sk-mock-3" });
  context.schedule();
  context.flush();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(timers.length, 0);
  assert.equal(saves.length, 1);
  context.flush();
  assert.equal(saves.length, 1, "无未决保存时冲刷是空操作");
});

test("桌面保存的 warning 透传为 toast，不打日志不打印密钥", async () => {
  const logged = [];
  const { context } = fixture({ warning: "系统安全存储不可用" });
  // fixture 的 desktop mock 已带 warning
  await context.saveKeyValue("sk-mock-4");
  assert.match(context.toasts.at(-1), /安全存储不可用/);
  assert.ok(!logged.length);
});
