// CanvasFlow 浏览器生图桥 - 内容脚本。
// 职责:轮询本地任务 → 在当前站点页面模拟人工操作(填提示词/粘参考图/点发送)
//      → 等待生成完成 → 抓取新出现的图片回传。
// 站点输入框/发送按钮的选择器:手动校准记录 优先于 内置预设 优先于 通用兜底。
//
// 重复注入守卫:manifest 自动注入与"校准此页面"的手动 executeScript 可能叠加到同一页面,
// 顶层 const 二次声明会直接 SyntaxError,双轮询还会各自领任务互相踩;
// 整体包进块作用域 + window 标记(同扩展的隔离世界共享),保证只有首次注入生效。
if (!window.__canvasflowBridgeActive) {
window.__canvasflowBridgeActive = true;

const POLL_INTERVAL_MS = 2500;
const WATCH_INTERVAL_MS = 2000;
const WATCH_TIMEOUT_MS = 300000;
const HARVEST_STABLE_CHECKS = 2;
const MIN_IMAGE_SIZE = 200;
const MAX_RESULT_IMAGES = 4;

// 内置站点默认选择器候选(按顺序尝试)。站点改版失效时用插件弹窗的"校准此页面"覆盖。
const SITE_PRESETS = {
  "gemini.google.com": {
    prompt: [
      "rich-textarea .ql-editor[contenteditable='true']",
      "rich-textarea [contenteditable='true']",
      "div[contenteditable='true']",
    ],
    send: [
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "button.send-button",
      "button[mattooltip*='Send']",
    ],
  },
  "chatgpt.com": {
    prompt: [
      "#prompt-textarea",
      "div[contenteditable='true']#prompt-textarea",
      "form div[contenteditable='true']",
      "form textarea",
    ],
    send: [
      "button[data-testid='send-button']",
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
    ],
  },
  "chat.openai.com": {
    prompt: [
      "#prompt-textarea",
      "form div[contenteditable='true']",
      "form textarea",
    ],
    send: [
      "button[data-testid='send-button']",
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
    ],
  },
};

const GENERIC_PROMPT_CANDIDATES = ["div[contenteditable='true']", "textarea"];
const GENERIC_SEND_CANDIDATES = [
  "button[aria-label*='发送']",
  "button[aria-label*='Send']",
  "button[data-testid*='send']",
  "form button[type='submit']",
];

let busy = false;
let calibrating = false;

function hostOf(origin) {
  try { return new URL(origin).host; } catch { return ""; }
}

async function getCalibration() {
  const stored = await chrome.storage.local.get("calibrations");
  const map = stored.calibrations || {};
  return map[location.origin] || null;
}

async function saveCalibration(entry) {
  const stored = await chrome.storage.local.get("calibrations");
  const map = stored.calibrations || {};
  map[location.origin] = entry;
  await chrome.storage.local.set({ calibrations: map });
}

function uniqueMatches(selector, element) {
  try {
    const found = document.querySelectorAll(selector);
    return found.length === 1 && found[0] === element;
  } catch { return false; }
}

// 为用户点选的元素生成尽量稳的 CSS 选择器:id → 关键属性 → 有限层级的标签路径
function buildSelector(element) {
  if (!(element instanceof Element)) return "";
  if (element.id && !/\s/.test(element.id)) {
    const selector = `#${CSS.escape(element.id)}`;
    if (uniqueMatches(selector, element)) return selector;
  }
  for (const attr of ["data-testid", "data-test", "name", "placeholder", "aria-label"]) {
    const value = element.getAttribute(attr);
    if (!value || value.length > 80) continue;
    const exact = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
    if (uniqueMatches(exact, element)) return exact;
    if (attr === "aria-label") {
      const partial = `${element.tagName.toLowerCase()}[aria-label*="${CSS.escape(value.slice(0, 20))}"]`;
      if (uniqueMatches(partial, element)) return partial;
    }
  }
  const parts = [];
  let current = element;
  for (let depth = 0; current && current.tagName !== "BODY" && depth < 5; depth += 1) {
    const parent = current.parentElement;
    if (!parent) break;
    const tag = current.tagName.toLowerCase();
    const sameTag = [...parent.children].filter(child => child.tagName === current.tagName);
    const index = sameTag.indexOf(current) + 1;
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    const candidate = parts.join(" > ");
    if (uniqueMatches(candidate, element)) return candidate;
    current = parent;
  }
  return parts.join(" > ");
}

function isVisible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

async function findPromptBox() {
  const calibration = await getCalibration();
  const host = hostOf(location.origin);
  const preset = SITE_PRESETS[host];
  const candidates = [
    ...(calibration?.promptSel ? [calibration.promptSel] : []),
    ...(preset?.prompt || []),
    ...GENERIC_PROMPT_CANDIDATES,
  ];
  for (const selector of candidates) {
    try {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) return element;
    } catch { /* 选择器非法则跳过 */ }
  }
  return null;
}

async function findSendButton() {
  const calibration = await getCalibration();
  const host = hostOf(location.origin);
  const preset = SITE_PRESETS[host];
  const candidates = [
    ...(calibration?.sendSel ? [calibration.sendSel] : []),
    ...(preset?.send || []),
    ...GENERIC_SEND_CANDIDATES,
  ];
  for (const selector of candidates) {
    try {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) return element;
    } catch { /* 选择器非法则跳过 */ }
  }
  return null;
}

async function dataUrlToFile(dataUrl, index) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], `canvasflow-ref-${index + 1}.png`, { type: blob.type || "image/png" });
}

// 粘贴参考图:优先模拟剪贴板粘贴(两家站点均支持),失败再找页面文件输入框
async function attachImages(promptBox, images) {
  const files = [];
  for (let index = 0; index < images.length; index += 1) {
    try { files.push(await dataUrlToFile(images[index], index)); } catch { /* 单张失败忽略 */ }
  }
  if (!files.length) return false;
  promptBox.focus();
  try {
    const transfer = new DataTransfer();
    files.forEach(file => transfer.items.add(file));
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer });
    promptBox.dispatchEvent(event);
    if (event.defaultPrevented) return true;
  } catch { /* 某些站点不支持合成粘贴 */ }
  await new Promise(resolve => setTimeout(resolve, 600));
  const fileInput = document.querySelector("input[type='file']");
  if (fileInput) {
    try {
      const transfer = new DataTransfer();
      files.forEach(file => transfer.items.add(file));
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch { /* 文件输入不可写 */ }
  }
  return false;
}

function fillPrompt(promptBox, text) {
  promptBox.focus();
  if (promptBox.tagName === "TEXTAREA" || promptBox.tagName === "INPUT") {
    const prototype = promptBox.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(promptBox, text);
    promptBox.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  document.execCommand("selectAll", false, null);
  const ok = document.execCommand("insertText", false, text);
  if (!ok) {
    promptBox.textContent = text;
    promptBox.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }
}

function collectNewImages(beforeSet) {
  const found = [];
  for (const image of document.querySelectorAll("img")) {
    const src = image.currentSrc || image.src || "";
    if (!src || beforeSet.has(src)) continue;
    const size = Math.max(image.naturalWidth, image.clientWidth || 0);
    if (size < MIN_IMAGE_SIZE) continue;
    found.push(image);
  }
  return found;
}

function snapshotImages() {
  const set = new Set();
  for (const image of document.querySelectorAll("img")) {
    const src = image.currentSrc || image.src || "";
    if (src) set.add(src);
  }
  return set;
}

async function imageToDataUrl(image) {
  const src = image.currentSrc || image.src || "";
  if (src.startsWith("data:")) return src;
  if (src.startsWith("blob:") || src.startsWith(location.origin)) {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(blob);
    });
  }
  const result = await chrome.runtime.sendMessage({ type: "fetchImageDataUrl", url: src });
  if (!result?.ok) throw new Error(result?.error || "图片下载失败");
  return result.dataUrl;
}

// 等待生成完成:轮询"发送后新出现的大图",连续稳定 HARVEST_STABLE_CHECKS 轮即收;超时按已得图片处理
async function waitForResults(beforeSet) {
  const startedAt = Date.now();
  let candidates = [];
  let stableChecks = 0;
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, WATCH_INTERVAL_MS));
    if (Date.now() - startedAt > WATCH_TIMEOUT_MS) break;
    checkBrowserAttention();
    const next = collectNewImages(beforeSet);
    if (next.length) {
      const same = next.length === candidates.length && next.every((image, index) => image === candidates[index]);
      stableChecks = same ? stableChecks + 1 : 0;
      candidates = next;
      if (candidates.length >= 1 && stableChecks >= HARVEST_STABLE_CHECKS && Date.now() - startedAt > 8000) break;
    } else {
      stableChecks = 0;
    }
  }
  const dataUrls = [];
  for (const image of candidates.slice(0, MAX_RESULT_IMAGES)) {
    try { dataUrls.push(await imageToDataUrl(image)); } catch { /* 单张失败忽略 */ }
  }
  return dataUrls;
}

function checkBrowserAttention() {
  const challenge = [...document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="challenges.cloudflare"], [role="alert"], [role="dialog"]')].find(element => isVisible(element) && (element.tagName === "IFRAME" || /验证您是人类|人机验证|请求过多|达到.*上限|too many requests|rate limit|verify you are human/i.test(element.textContent || "")));
  if (challenge) { const error = new Error("站点要求验证或提示限流，浏览器队列已暂停；请手动处理后在插件中继续队列"); error.requiresAttention = true; throw error; }
}

async function runTask(task) {
  checkBrowserAttention();
  const readyAt = Date.now();
  let promptBox;
  while (!(promptBox = await findPromptBox())) { checkBrowserAttention(); if (Date.now() - readyAt > 30000) break; await new Promise(resolve => setTimeout(resolve, 500)); }
  if (!promptBox) throw new Error("未找到输入框：请在插件弹窗中「校准此页面」后重试");
  fillPrompt(promptBox, task.prompt || "");
  await new Promise(resolve => setTimeout(resolve, 400));
  if (task.images?.length && !await attachImages(promptBox, task.images)) {
    throw new Error("页面未接收参考图：请确认站点支持粘贴图片或文件上传，再重新校准输入框");
  }
  await new Promise(resolve => setTimeout(resolve, 600));
  // Uploading can replace or disable the send button. Resolve it after attachments settle.
  const sendStartedAt = Date.now();
  let sendButton;
  for (;;) {
    checkBrowserAttention();
    sendButton = await findSendButton();
    if (sendButton && !sendButton.disabled && sendButton.getAttribute("aria-disabled") !== "true") break;
    if (Date.now() - sendStartedAt > 30000) throw new Error("发送按钮不可用：请等待参考图上传完成，或在插件中校准发送按钮");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const beforeSet = snapshotImages();
  promptBox.focus();
  const originalText = promptBox.value ?? promptBox.textContent;
  let enterHandled = false;
  for (const type of ["keydown", "keypress", "keyup"]) {
    const event = new KeyboardEvent(type, {key:"Enter", code:"Enter", keyCode:13, which:13, bubbles:true, cancelable:true});
    promptBox.dispatchEvent(event); enterHandled ||= event.defaultPrevented;
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
  const currentSend = await findSendButton();
  if (!enterHandled && currentSend && !currentSend.disabled && currentSend.getAttribute("aria-disabled") !== "true" && (promptBox.value ?? promptBox.textContent) === originalText) currentSend.click();
  const images = await waitForResults(beforeSet);
  if (!images.length) throw new Error("等待超时：页面上没有出现新生成的图片（可在插件弹窗校准选择器，或站点响应较慢请重试）");
  return { images, text: "" };
}

async function handlePoll() {
  if (busy || calibrating) return;
  const response = await chrome.runtime.sendMessage({ type: "browserPoll", origin: location.origin });
  if (!response?.ok || !response.task) return;
  const task = response.task;
  busy = true;
  try {
    const result = await runTask(task);
    await chrome.runtime.sendMessage({ type: "browserResult", payload: { taskId: task.id, ok: true, images: result.images, text: result.text } });
  } catch (error) {
    await chrome.runtime.sendMessage({ type: "browserResult", payload: { taskId: task.id, ok: false, requiresAttention: error?.requiresAttention === true, error: error?.message || String(error) } }).catch(() => {});
  } finally {
    busy = false;
  }
}

function pollLoop() {
  handlePoll()
    .catch(() => {})
    .finally(() => setTimeout(pollLoop, POLL_INTERVAL_MS));
}
pollLoop();

// ---------- 手动校准:两步点选(输入框 → 发送按钮),记录选择器按 origin 保存 ----------

let calibrationState = null;

function showCalibrationBanner(text) {
  hideCalibrationBanner();
  const banner = document.createElement("div");
  banner.id = "canvasflow-calibration-banner";
  banner.textContent = `CanvasFlow 校准：${text}（按 Esc 取消）`;
  Object.assign(banner.style, {
    position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)",
    zIndex: "2147483647", padding: "10px 18px", borderRadius: "10px",
    background: "rgba(20,22,26,.92)", color: "#fff", font: "13px/1.5 system-ui, sans-serif",
    boxShadow: "0 8px 24px rgba(0,0,0,.35)", pointerEvents: "none",
  });
  document.documentElement.appendChild(banner);
}

function hideCalibrationBanner() {
  document.getElementById("canvasflow-calibration-banner")?.remove();
}

function highlightElement(element) {
  document.getElementById("canvasflow-calibration-highlight")?.remove();
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const box = document.createElement("div");
  box.id = "canvasflow-calibration-highlight";
  Object.assign(box.style, {
    position: "fixed", left: `${rect.left - 3}px`, top: `${rect.top - 3}px`,
    width: `${rect.width + 6}px`, height: `${rect.height + 6}px`,
    border: "2px solid #2f80ed", borderRadius: "6px", pointerEvents: "none",
    zIndex: "2147483646", background: "rgba(47,128,237,.12)",
  });
  document.documentElement.appendChild(box);
}

function clearCalibrationListeners() {
  document.removeEventListener("click", onCalibrationClick, true);
  document.removeEventListener("mousemove", onCalibrationHover, true);
  document.removeEventListener("keydown", onCalibrationKeydown, true);
  hideCalibrationBanner();
  highlightElement(null);
}

function onCalibrationHover(event) {
  if (!calibrationState) return;
  event.stopPropagation();
  highlightElement(event.target);
}

async function onCalibrationClick(event) {
  if (!calibrationState) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const element = event.target;
  if (calibrationState.step === "prompt") {
    calibrationState.promptSel = buildSelector(element);
    calibrationState.step = "send";
    showCalibrationBanner("已记录输入框，请点击页面上的【发送按钮】");
  } else if (calibrationState.step === "send") {
    calibrationState.sendSel = buildSelector(element);
    const entry = { promptSel: calibrationState.promptSel, sendSel: calibrationState.sendSel, at: Date.now() };
    await saveCalibration(entry);
    clearCalibrationListeners();
    calibrationState = null;
    showCalibrationBanner("校准完成，已保存");
    setTimeout(hideCalibrationBanner, 2500);
  }
}

function onCalibrationKeydown(event) {
  if (event.key !== "Escape") return;
  clearCalibrationListeners();
  calibrationState = null;
}

function startCalibration() {
  if (calibrating) return;
  calibrating = true;
  calibrationState = { step: "prompt", promptSel: "", sendSel: "" };
  document.addEventListener("mousemove", onCalibrationHover, true);
  document.addEventListener("click", onCalibrationClick, true);
  document.addEventListener("keydown", onCalibrationKeydown, true);
  showCalibrationBanner("请点击页面上的【对话输入框】");
  const release = () => { calibrating = false; document.removeEventListener("click", release, true); };
  document.addEventListener("click", release, true);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "startCalibration") {
    startCalibration();
    sendResponse({ ok: true });
  }
  return true;
});

}
