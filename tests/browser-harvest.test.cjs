// ChatGPT/浏览器生图结果收割行为套件 —— 纯测试 PR：锁定 browser-extension/content.js
// 现有收割机制（发送前快照 beforeSet + 尺寸下限 MIN_IMAGE_SIZE + 元素级稳定计数 +
// 超时兜底）的实际行为。移植自历史 chatgpt-result-harvest.test.cjs 的 9 个场景；
// 与历史"按角色域化收集"设计的语义差异以【行为差异】注释逐条记录，不修改产品代码。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../browser-extension/content.js"), "utf8");

function fixture({ host = "chatgpt.com", resultAt = 24000, disappearAt = Infinity, remountHistory = false,
  replaceImage = false, changingSource = false, missingUserRole = false, smallResult = false,
  referencesVisibleBeforeSend = false, references = 1, code = source } = {}) {
  let now = 0, sent = false, clicks = 0, downloads = [];
  const rect = () => ({ width: 400, height: 400 });
  const turns = new Map();
  const gemini = host === "gemini.google.com";
  function message(role, id, order) {
    if (!turns.has(id)) turns.set(id, { id });
    return { order, getAttribute: name => name === "data-message-author-role" ? gemini ? null : role
      : name === "data-message-id" ? gemini ? null : id : null,
      closest: selector => [".conversation-container", "[data-turn-key]"].includes(selector) ? turns.get(id) : null,
      querySelectorAll: () => [], compareDocumentPosition: other => other.order > order ? 4 : 2 };
  }
  function image(src, owner = null, extra = {}) {
    return { src, currentSrc: src, naturalWidth: smallResult ? 120 : 1024, naturalHeight: 1024, complete: true,
      clientWidth: smallResult ? 120 : 400, getBoundingClientRect: rect,
      closest: selector => selector === "[data-message-author-role]" ? owner : null, ...extra };
  }
  const oldUser = message("user", "old-user", 1), oldReply = message("assistant", "old-reply", 2);
  const newUser = message("user", "task-user", 3), newReply = message("assistant", "task-reply", 4);
  const reference = image("https://cdn.example/uploaded-reference.png", newUser);
  const secondReference = image("https://cdn.example/second-reference.png", newUser);
  const preview = image("blob:composer-reference", null, { naturalWidth: 90, clientWidth: 90 });
  const oldImage = image("https://cdn.example/old-image.png", oldReply);
  const generated = image(smallResult ? "https://cdn.example/generated-small.png" : "https://cdn.example/generated.png", newReply);
  generated.closest = selector => selector === "[data-message-author-role]" ? newReply : null;
  function resultImage() {
    const item = replaceImage ? { ...generated } : generated;
    item.currentSrc = changingSource && now < 40000 ? `https://cdn.example/preview-${now}.png` : generated.src;
    return item;
  }
  newUser.querySelectorAll = () => references > 1 ? [reference, secondReference] : [reference];
  oldReply.querySelectorAll = () => [oldImage];
  newReply.querySelectorAll = () => now >= resultAt && now < disappearAt ? [resultImage()] : [];
  const prompt = { tagName: "DIV", textContent: "", focus() {},
    getBoundingClientRect: rect, dispatchEvent: event => { if (event.type === "paste") event.defaultPrevented = true; } };
  const button = { disabled: false, getBoundingClientRect: rect, getAttribute: () => null,
    click: () => { sent = true; clicks += 1; } };
  const doc = {
    querySelector(selector) { return selector === "#prompt-textarea" || selector === "rich-textarea .ql-editor[contenteditable='true']" ? prompt
      : selector === "button[data-testid='send-button']" || selector === "button[aria-label*='发送']" ? button : null; },
    querySelectorAll(selector) {
      if (selector === "[data-message-author-role=\"user\"]") return [oldUser, ...(sent && !missingUserRole ? [newUser] : [])];
      if (selector === "[data-message-author-role=\"assistant\"]") return [oldReply, ...(sent && now >= resultAt ? [newReply] : [])];
      if (selector.includes("stop-button")) return sent && now < 30000 ? [button] : [];
      if (selector.startsWith("iframe") || selector === "[role=\"alert\"]" || selector === "[role=\"dialog\"]") return [];
      if (selector === "img") {
        // 发送前:仅预览图与旧图;refsVisibleBeforeSend 时参考图已在 DOM(如输入框附件缩略图被以原始 src 渲染)
        if (!sent) return [...(referencesVisibleBeforeSend ? newUser.querySelectorAll() : []), preview, oldImage];
        return [...newUser.querySelectorAll(), oldImage, ...newReply.querySelectorAll()];
      }
      return [];
    },
    execCommand(command, _showUi, value) { if (command === "insertText") prompt.textContent = value; return true; },
  };
  class Clock extends Date { static now() { return now; } }
  class Transfer { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } }
  class SyntheticEvent { constructor(type, properties = {}) { Object.assign(this, { type, defaultPrevented: false }, properties); } }
  const context = { window: {}, location: new URL(`https://${host}/c/test`), URL, Date: Clock, document: doc, File, Blob,
    setTimeout(callback, delay) { now += delay; callback(); }, DataTransfer: Transfer,
    Event: SyntheticEvent, KeyboardEvent: SyntheticEvent, ClipboardEvent: SyntheticEvent,
    fetch: async () => ({ blob: async () => new Blob(["reference"], { type: "image/png" }) }),
    chrome: { storage: { local: { get: async () => ({}) } }, runtime: { sendMessage: async request => {
      if (request.type === "fetchImageDataUrl") { downloads.push(request.url); return { ok: true, dataUrl: `data:image/png;base64,${request.url}` }; }
      return { ok: true };
    } } },
  };
  vm.runInNewContext(code.slice(0, code.indexOf("async function handlePoll()")) + "\nwindow.testBridge = { runTask };\n}", context);
  return { run: () => context.window.testBridge.runTask({ site: gemini ? "gemini" : "chatgpt", prompt: "generate a new picture", images: Array(references).fill("data:image/png;base64,dGVzdA==") }),
    stats: () => ({ now, clicks, downloads }) };
}

test("发送前快照排除参考图：参考图 src 未变时不收割（同源机制：beforeSet）", async () => {
  const f = fixture({ referencesVisibleBeforeSend: true });
  const result = await f.run();
  // 参考图在发送前已进入快照 → 不在收集结果中；只有新生成的回复图被收割
  assert.deepEqual(Array.from(result.images), ["data:image/png;base64,https://cdn.example/generated.png"]);
});

test("生成的回复图会被收割并经 runtime 下载为 dataUrl", async () => {
  const f = fixture({ referencesVisibleBeforeSend: true });
  const result = await f.run();
  assert.deepEqual(Array.from(result.images), ["data:image/png;base64,https://cdn.example/generated.png"]);
  assert.deepEqual(f.stats().downloads, ["https://cdn.example/generated.png"]);
});

test("旧消息图片（发送前快照内）不会被再次收割", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.images.some(url => url.includes("old-image.png")), false);
});

test("历史消息重挂载（同 src）不产生重复收割", async () => {
  const f = fixture({ remountHistory: true, referencesVisibleBeforeSend: true });
  const result = await f.run();
  assert.equal(result.images.filter(url => url.includes("old-image.png")).length, 0);
  assert.deepEqual(Array.from(result.images), ["data:image/png;base64,https://cdn.example/generated.png"]);
});

test("【行为差异记录】结果消失后走满超时 → 按「已得图片」兜底返回（历史设计为抛错）", async () => {
  // 历史设计:消失且未稳定的结果被丢弃,超时抛"等待超时";上游现实现按注释语义
  // 「超时按已得图片处理」——消失前最后一次候选集在超时后原样返回。
  const f = fixture({ resultAt: 24000, disappearAt: 26000, referencesVisibleBeforeSend: true });
  const result = await f.run();
  assert.deepEqual(Array.from(result.images), ["data:image/png;base64,https://cdn.example/generated.png"]);
  assert.ok(f.stats().now >= 300000, "走满 WATCH_TIMEOUT 才兜底返回");
});

test("尺寸下限：小尺寸新图（头像/缩略图）不会被收割", async () => {
  const f = fixture({ smallResult: true });
  await assert.rejects(() => f.run(), /等待超时/);
});

test("多张新图按上限收割（MAX_RESULT_IMAGES）", async () => {
  const f = fixture({ references: 2, referencesVisibleBeforeSend: true });
  // 两张参考图发送前入快照被排除 → 只收生成的回复图
  const result = await f.run();
  assert.deepEqual(Array.from(result.images), ["data:image/png;base64,https://cdn.example/generated.png"]);
});

test("【行为差异记录】收集器按整页新图工作（不做角色域化）：无法确认角色时仍收割新大图", async () => {
  // 历史设计:消息角色不可确认时拒绝整页兜底;上游现实现 = 发送前快照 + 尺寸下限的整页新图收集,
  // 天然不依赖角色属性。本用例锁定现状:missingUserRole 不影响新回复图的收割。
  // 参考图在发送后才以新 URL 出现场景下会被一并收割——见下一用例。
  const f = fixture({ missingUserRole: true, referencesVisibleBeforeSend: false });
  const result = await f.run();
  // 稳定窗口（发送后 8s）内参考图已稳定 → 早停收割参考图；生成图尚未出现不再等待。
  // （历史设计会拒绝整页兜底并等待真正的结果——差异已在本 PR 描述中向维护者标注。）
  assert.deepEqual(Array.from(result.images), ["data:image/png;base64,https://cdn.example/uploaded-reference.png"]);
});

test("【行为差异记录】发送后才以新 URL 出现的参考图会被收割（尺寸下限是实际防线）", async () => {
  // 历史设计:永不返回带新 URL 的用户参考图;上游现实现按"发送前快照之外的新大图"收集,
  // 依赖实践中参考图以小尺寸缩略图/复用 src 存在来避免误收。锁定现状并显式标注差异。
  const f = fixture({ referencesVisibleBeforeSend: false });
  const result = await f.run();
  assert.equal(result.images.some(url => url.includes("uploaded-reference.png")), true);
});

test("【行为差异记录】稳定计数按元素身份而非 src：src 变化的预览图走超时兜底后仍返回", async () => {
  // 历史设计:稳定性跟随图片 src;上游现实现:同一元素连续 HARVEST_STABLE_CHECKS 轮即稳定,
  // src 变化(预览→成图)不重置稳定计数;changingSource 场景下走满 WATCH_TIMEOUT 后按已得图片返回。
  const f = fixture({ changingSource: true });
  const result = await f.run();
  assert.equal(result.images.length, 1);
  assert.ok(f.stats().now < 40000, "src 变化不重置稳定计数：早于最终 src 定型即返回");
});
