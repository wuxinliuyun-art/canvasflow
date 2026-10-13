// CanvasFlow 浏览器生图桥 - 弹窗:连接状态、页面校准入口。
// 连接是全自动的:后台自动发现本机 CanvasFlow 服务,端口输入仅作高级手动覆盖(留空=自动)。

const $ = id => document.getElementById(id);

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

async function refreshCalibrationInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { $("calibrationInfo").textContent = ""; $("clearCalibration").classList.add("hidden"); return; }
  let origin = "";
  try { origin = `${new URL(tab.url).protocol}//${new URL(tab.url).host}`; } catch { /* 非法地址忽略 */ }
  const stored = await chrome.storage.local.get("calibrations");
  const entry = (stored.calibrations || {})[origin];
  if (entry) {
    $("calibrationInfo").textContent = `当前站点已校准（输入框与发送按钮均已记录于 ${new Date(entry.at).toLocaleString()}）`;
    $("clearCalibration").classList.remove("hidden");
  } else {
    $("calibrationInfo").textContent = "当前站点尚未校准，将使用内置默认选择器。";
    $("clearCalibration").classList.add("hidden");
  }
}

async function ping({ quiet = false } = {}) {
  if (!quiet) setStatus("正在查找本机 CanvasFlow 服务…");
  const result = await chrome.runtime.sendMessage({ type: "ping" }).catch(error => ({ ok: false, error: error.message }));
  if (result?.ok && result.alive) {
    const extra = result.ports?.length > 1 ? `，另发现 ${result.ports.length - 1} 个实例` : "";
    setStatus(`已自动连接 CanvasFlow（127.0.0.1:${result.port}${extra}）`, "ok");
  } else {
    setStatus(result?.error || "未发现本机 CanvasFlow 服务（请先启动 CanvasFlow）", "bad");
  }
}

$("ping").addEventListener("click", () => ping());

$("savePort").addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "setSettings", serverPort: $("port").value }).catch(error => ({ ok: false, error: error.message }));
  if (result?.ok) {
    setStatus($("port").value.trim() ? "已保存手动端口" : "已恢复自动发现", "ok");
    ping();
  } else {
    setStatus(result?.error || "保存失败", "bad");
  }
});

$("calibrate").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("http")) { setStatus("请在 AI 站点的网页标签页上使用校准", "bad"); return; }
  // 任意站点:先注册内容脚本(本页立即注入),再进入两步点选
  const ensure = await chrome.runtime.sendMessage({ type: "ensureContentScript", tabUrl: tab.url }).catch(error => ({ ok: false, error: error.message }));
  if (!ensure?.ok) { setStatus(ensure?.error || "内容脚本注册失败", "bad"); return; }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch { /* 已注入时重复执行无害(content.js 幂等注册) */ }
  const response = await chrome.tabs.sendMessage(tab.id, { type: "startCalibration" }).catch(error => ({ ok: false, error: error.message }));
  if (response?.ok) {
    setStatus("校准开始：回到页面，依次点击输入框和发送按钮", "ok");
    setTimeout(refreshCalibrationInfo, 4000);
  } else {
    setStatus(response?.error || "无法在该页面启动校准（浏览器内置页不支持）", "bad");
  }
});

$("clearCalibration").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  let origin = "";
  try { origin = `${new URL(tab.url).protocol}//${new URL(tab.url).host}`; } catch { return; }
  const stored = await chrome.storage.local.get("calibrations");
  const map = stored.calibrations || {};
  delete map[origin];
  await chrome.storage.local.set({ calibrations: map });
  refreshCalibrationInfo();
});

(async () => {
  const settings = await chrome.runtime.sendMessage({ type: "getSettings" });
  $("port").value = settings?.serverPort ?? "";
  $("port").placeholder = settings?.autoPort ? `自动（当前 ${settings.autoPort}）` : "自动发现";
  await ping({ quiet: true });
  refreshCalibrationInfo();
})();

$("resumeBrowserQueue").addEventListener("click", async () => { const result = await chrome.runtime.sendMessage({type:"resumeBrowserQueue"}); setStatus(result?.ok ? "浏览器队列已继续" : "继续失败", result?.ok ? "ok" : "bad"); });
