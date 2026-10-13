// CanvasFlow 浏览器生图桥 - 后台中继(Manifest V3 Service Worker)。
// 内容脚本运行在站点页面源下,直接 fetch 127.0.0.1 会被 CanvasFlow 服务的跨源保护拦截,
// 因此所有本地服务访问都经这里转发(扩展拥有 host_permissions,不受页面 CORS 限制)。
//
// 服务发现:用户不需要懂端口。默认扫描 127.0.0.1 的 5173..5192(server.js 端口被占时
// 最多顺延 20 个,扫描范围必须与之保持一致),认准 /api/browser-task/status/ping 回
// {"status":"expired"} 的才是 CanvasFlow;手动指定的端口优先,失效后自动退回扫描。

const DEFAULT_PORT = 5173;
const PORT_SCAN_LIMIT = 20; // 与 server.js tryListen 的顺延次数上限一致
const RESOLVE_TTL_MS = 30000; // 已解析结果的复用时长,过期后重新验证
const RESOLVE_EMPTY_TTL_MS = 10000; // 扫描无结果的冷却时间,避免每次轮询都全量扫描
const TASK_PORT_TTL_MS = 15 * 60 * 1000; // 任务→端口 记录的保留时长(任务本身 10 分钟过期)

let resolveCache = { ports: [], at: 0 };

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

async function manualPort() {
  const stored = await storageGet("serverPort");
  return validPort(stored.serverPort);
}

// 判定某端口是否是"会说浏览器生图协议的 CanvasFlow":旧版/无关服务对 ping 都回 404
async function pingPort(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/browser-task/status/ping`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return !!(data && data.status === "expired");
  } catch {
    return false;
  }
}

async function scanPorts() {
  const found = [];
  for (let offset = 0; offset < PORT_SCAN_LIMIT; offset += 1) {
    const port = DEFAULT_PORT + offset;
    // eslint-disable-next-line no-await-in-loop -- 端口要按序探测,命中即靠前
    if (await pingPort(port)) found.push(port);
  }
  return found;
}

// 返回当前所有可用的 CanvasFlow 端口(优先级降序:手动指定 > 上次自动缓存 > 全量扫描)
async function resolveServerPorts(force = false) {
  const ttl = resolveCache.ports.length ? RESOLVE_TTL_MS : RESOLVE_EMPTY_TTL_MS;
  if (!force && Date.now() - resolveCache.at < ttl) return resolveCache.ports;
  const ports = [];
  const manual = await manualPort();
  if (manual && await pingPort(manual)) ports.push(manual);
  const stored = await storageGet("autoPort");
  const auto = validPort(stored.autoPort);
  if (auto && !ports.includes(auto) && await pingPort(auto)) ports.push(auto);
  // Always discover all instances: a cached server must not hide the desktop queue.
  for (const port of await scanPorts()) if (!ports.includes(port)) ports.push(port);
  if (ports.length) await chrome.storage.local.set({ autoPort: ports[0] });
  resolveCache = { ports, at: Date.now() };
  return ports;
}

async function rememberTaskPort(taskId, port) {
  if (!taskId) return;
  const stored = await storageGet("taskPorts");
  const map = stored.taskPorts || {};
  const now = Date.now();
  for (const key of Object.keys(map)) if (now - (map[key]?.at || 0) > TASK_PORT_TTL_MS) delete map[key];
  map[taskId] = { port, at: now };
  await chrome.storage.local.set({ taskPorts: map });
}

async function forgetTaskPort(taskId) {
  const stored = await storageGet("taskPorts");
  const map = stored.taskPorts || {};
  if (map[taskId]) {
    delete map[taskId];
    await chrome.storage.local.set({ taskPorts: map });
  }
}

async function serverUrl(path, port) {
  return `http://127.0.0.1:${port}${path}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`本地服务 HTTP ${response.status}`);
  return response.json();
}

async function blobToDataUrl(blob) {
  // MV3 service workers do not expose FileReader.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(chunks.join(""))}`;
}

// match pattern → 正则(仅用于判定 manifest 是否已覆盖某 URL,本扩展的 pattern 都是精确主机)
function globToRegExp(pattern) {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
}

function manifestPatterns() {
  return (chrome.runtime.getManifest().content_scripts || []).flatMap(script => script.matches || []);
}

// manifest 已声明自动注入的站点不进 ensureContentScript 的动态注册,
// 否则每次开页双份注入:顶层 const 二次声明直接 SyntaxError(2026-10 实踩)
function isCoveredByManifest(url) {
  return manifestPatterns().some(pattern => globToRegExp(pattern).test(url));
}

// 清理历史遗留的冗余动态注册(全部 matches 都被 manifest 覆盖才删,自定义站点注册保留)
async function pruneRedundantContentScripts() {
  try {
    const patterns = manifestPatterns();
    if (!patterns.length) return;
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const redundant = existing.filter(script => (script.matches || []).length > 0
      && (script.matches || []).every(match => patterns.some(pattern => globToRegExp(pattern).test(match))));
    if (redundant.length) {
      await chrome.scripting.unregisterContentScripts({ ids: redundant.map(script => script.id) });
    }
  } catch { /* 清理失败不影响主流程 */ }
}
pruneRedundantContentScripts();

let browserClaimBusy = false;
async function browserLaneOccupied() {
  const stored = await storageGet(["activeBrowserTask", "browserQueuePaused"]);
  if (stored.browserQueuePaused) return true;
  const active = stored.activeBrowserTask;
  if (!active) return false;
  try {
    const status = await fetchJson(await serverUrl("/api/browser-task/status/" + encodeURIComponent(active.id), active.port), {cache: "no-store", signal: AbortSignal.timeout(3000)});
    if (["completed", "failed", "cancelled", "expired"].includes(status.status)) {
      await chrome.storage.local.remove("activeBrowserTask"); return false;
    }
  } catch { }
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "resumeBrowserQueue": { await chrome.storage.local.remove("browserQueuePaused"); sendResponse({ok:true}); return; }
      case "getSettings": {
        const stored = await storageGet(["serverPort", "autoPort"]);
        sendResponse({
          ok: true,
          serverPort: validPort(stored.serverPort) || "",
          autoPort: validPort(stored.autoPort) || "",
          defaultPort: DEFAULT_PORT,
        });
        return;
      }
      case "setSettings": {
        const raw = String(message.serverPort ?? "").trim();
        if (!raw) {
          // 清空 = 回到纯自动发现
          await chrome.storage.local.remove("serverPort");
          resolveCache = { ports: [], at: 0 };
          sendResponse({ ok: true });
          return;
        }
        const port = validPort(raw);
        if (!port) throw new Error("端口号无效");
        await chrome.storage.local.set({ serverPort: port });
        resolveCache = { ports: [], at: 0 };
        sendResponse({ ok: true });
        return;
      }
      case "ping": {
        const ports = await resolveServerPorts(true);
        if (!ports.length) {
          sendResponse({ ok: false, error: "未发现本机 CanvasFlow 服务（请先启动 CanvasFlow）" });
          return;
        }
        sendResponse({ ok: true, alive: true, port: ports[0], ports });
        return;
      }
      case "browserPoll": {
        if (browserClaimBusy || openingPages) { sendResponse({ ok: true, task: null }); return; }
        browserClaimBusy = true;
        try {
        if (await browserLaneOccupied()) { sendResponse({ok:true, task:null}); return; }
        const origin = String(message.origin || "");
        if (!origin) throw new Error("缺少页面来源");
        const ports = await resolveServerPorts();
        if (!ports.length) throw new Error("未发现本机 CanvasFlow 服务（请先启动 CanvasFlow）");
        // 多实例并存时逐个问询:任务在哪台实例上就在哪台领取,并把端口记到任务名下
        for (const port of ports) {
          const pending = await fetchJson(await serverUrl("/api/browser-task/pending", port), {cache: "no-store"}).catch(() => null);
          const next = pending?.tasks?.[0];
          if (next && new URL(browserTaskUrl(next)).origin !== origin && !(next.site === "chatgpt" && origin === "https://chat.openai.com")) continue;
          const opened = (await storageGet("openedBrowserTasks")).openedBrowserTasks || {};
          if (next?.newConversation && !opened[`${port}:${next.id}`]) {
            await ensureTaskPage(next); opened[`${port}:${next.id}`] = Date.now();
            await chrome.storage.local.set({ openedBrowserTasks: opened });
            sendResponse({ok: true, task: null}); return;
          }
          const data = await fetchJson(await serverUrl(`/api/browser-task/next?origin=${encodeURIComponent(origin)}`, port), { cache: "no-store" }).catch(() => null);
          if (data?.task) {
            await chrome.storage.local.set({ activeBrowserTask: { id: data.task.id, port, tabId: sender.tab?.id, at: Date.now() } });
            await rememberTaskPort(data.task.id, port);
            if (sender.tab?.id != null) {
              await chrome.tabs.update(sender.tab.id, { active: true });
              await chrome.windows.update(sender.tab.windowId, { focused: true });
            }
            sendResponse({ ok: true, task: data.task });
            return;
          }
        }
        sendResponse({ ok: true, task: null });
        return;
        } finally { browserClaimBusy = false; }
      }
      case "browserResult": {
        const taskId = message.payload?.taskId;
        const stored = await storageGet("taskPorts");
        const port = validPort(stored.taskPorts?.[taskId]?.port) || (await resolveServerPorts())[0];
        if (!port) throw new Error("未发现本机 CanvasFlow 服务（请先启动 CanvasFlow）");
        if (message.payload?.requiresAttention) await chrome.storage.local.set({ browserQueuePaused: message.payload.error || "请检查目标站点" });
        const data = await fetchJson(await serverUrl("/api/browser-task/result", port), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.payload || {}),
        });
        if (message.payload?.requiresAttention) await chrome.storage.local.set({ browserQueuePaused: message.payload.error || "请检查目标站点" });
        const active = (await storageGet("activeBrowserTask")).activeBrowserTask;
        if (active?.id === taskId) await chrome.storage.local.remove("activeBrowserTask");
        await forgetTaskPort(taskId);
        sendResponse({ ok: true, data });
        return;
      }
      // 站点 CDN 图片(如 googleusercontent)由后台抓取:content 脚本受页面 CORS 限制,后台不受
      case "fetchImageDataUrl": {
        const url = String(message.url || "");
        if (!/^https?:\/\//i.test(url)) throw new Error("仅支持 http(s) 图片地址");
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`图片下载 HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("响应不是图片");
        sendResponse({ ok: true, dataUrl: await blobToDataUrl(blob) });
        return;
      }
      // 自定义站点:把 content.js 动态注册到该 origin,后续新开标签页也会自动注入
      case "ensureContentScript": {
        const tabUrl = String(message.tabUrl || "");
        const parsed = new URL(tabUrl);
        const matchPattern = `${parsed.protocol}//${parsed.host}/*`;
        const already = isCoveredByManifest(tabUrl)
          || (await chrome.scripting.getRegisteredContentScripts()).some(script => (script.matches || []).includes(matchPattern));
        if (!already) {
          await chrome.scripting.registerContentScripts([{
            id: `canvasflow-${parsed.host}`,
            matches: [matchPattern],
            js: ["content.js"],
            runAt: "document_idle",
          }]);
        }
        sendResponse({ ok: true });
        return;
      }
      default:
        throw new Error(`未知消息类型: ${message?.type}`);
    }
  })().catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true; // 异步 sendResponse
});

// Background discovery opens the destination even when no site content script is running.
function browserTaskUrl(task) {
  if (task.site === "gemini") return "https://gemini.google.com/app";
  if (task.site === "chatgpt") return "https://chatgpt.com/";
  const origin = new URL(task.site);
  if (!["https:", "http:"].includes(origin.protocol)) throw new Error("站点网址必须是 http(s)");
  const target = new URL(task.pageUrl || task.site);
  if (target.origin !== origin.origin || target.username || target.password) throw new Error("站点网址与任务来源不一致");
  return target.href;
}

async function ensureTaskPage(task) {
  const url = browserTaskUrl(task);
  if (!isCoveredByManifest(url)) {
    const parsed = new URL(url);
    const match = `${parsed.protocol}//${parsed.host}/*`;
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (!scripts.some(script => script.matches?.includes(match))) {
      await chrome.scripting.registerContentScripts([{id: `canvasflow-${parsed.host}`, matches: [match], js: ["content.js"], runAt: "document_idle"}]);
    }
  }
  const origin = new URL(url).origin;
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(tab => {
    try { return new URL(tab.url || "").origin === origin || task.site === "chatgpt" && new URL(tab.url || "").origin === "https://chat.openai.com"; }
    catch { return false; }
  });
  if (tab) {
    const navigate = task.newConversation === true || task.site !== "gemini" && task.site !== "chatgpt" && task.pageUrl && tab.url !== url;
    await chrome.tabs.update(tab.id, { active: true, ...(navigate ? { url } : {}) });
    await chrome.windows.update(tab.windowId, { focused: true });
    // Reloaded extensions do not automatically inject into existing tabs.
    if (!navigate) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } else {
    const openedTab = await chrome.tabs.create({ url, active: true });
    if (openedTab?.windowId != null) await chrome.windows.update(openedTab.windowId, { focused: true });
  }
}

let openingPages = false;
async function openPendingTaskPages() {
  if (openingPages || browserClaimBusy) return;
  openingPages = true;
  try {
    if (await browserLaneOccupied()) return;
    const ports = await resolveServerPorts();
    const stored = await storageGet("openedBrowserTasks");
    const opened = stored.openedBrowserTasks || {};
    const now = Date.now();
    for (const id of Object.keys(opened)) if (now - opened[id] > TASK_PORT_TTL_MS) delete opened[id];
    for (const port of ports) {
      const data = await fetchJson(await serverUrl("/api/browser-task/pending", port), {cache: "no-store", signal: AbortSignal.timeout(3000)}).catch(() => null);
      for (const task of data?.tasks || []) {
        const key = `${port}:${task.id}`;
        if (opened[key]) return;
        await ensureTaskPage(task);
        opened[key] = now;
        await chrome.storage.local.set({ openedBrowserTasks: opened });
        return; // Open only the next destination; never navigate other tasks during generation.
      }
    }
  } finally { openingPages = false; }
}
const OPEN_TASK_ALARM = "canvasflow-open-browser-tasks";
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === OPEN_TASK_ALARM) openPendingTaskPages().catch(() => {});
});
chrome.alarms.create(OPEN_TASK_ALARM, { periodInMinutes: 0.5 });
openPendingTaskPages().catch(() => {});
// Fast response while awake; the alarm resumes discovery if the worker is suspended.
setInterval(() => openPendingTaskPages().catch(() => {}), 3000);
