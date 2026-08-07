// CanvasFlow - 统一面板 (控制中心 + 截图)

var POLL_INTERVAL = 3000;
var POLL_MAX = 120;

var els = {};
var apiKey = "";
var libraryItems = [];
var capturedFrameData = null;
var capturedFrameSize = { w: 0, h: 0 };
var cropPercent = { x: 0, y: 0, w: 0, h: 0 };
var hasCropArea = false;
var isGenerating = false;
var currentPollTimer = null;
var results = [];
var theme = "light";
var savedDisplay = null;
var desktop = window.canvasflowDesktop || null;
var panelPinned = true;

function $(id) { return document.getElementById(id); }

function toast(msg) {
  var t = els.errorToast;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.add("hidden"); }, 4000);
}

function ensureExpanded() {
  if (els.panel.classList.contains("compact")) {
    els.panel.classList.remove("compact");
    els.expandedBody.classList.remove("hidden");
    if (desktop) desktop.setPanelCompact(false);
  }
}

async function loadSettings() {
  var saved = {};
  try {
    if (desktop) {
      var response = await fetch("/api/screenshot-settings", { cache: "no-store" });
      if (response.ok) saved = (await response.json()).settings || {};
    } else {
      var raw = localStorage.getItem("screenshot_settings");
      if (raw) saved = JSON.parse(raw);
    }
    if (saved && Object.keys(saved).length) {
      els.customPromptInput.value = saved.promptCustom || "";
      if (saved.promptLibraryId) {
        els.customPromptInput.dataset.libraryPromptId = saved.promptLibraryId;
        els.customPromptInput.dataset.libraryPromptName = saved.promptLibraryName || "";
      }
      if (saved.cropPercent && saved.cropPercent.w > 0) {
        cropPercent = saved.cropPercent;
        hasCropArea = true;
      }
      savedDisplay = saved.display || null;
      if (typeof saved.alwaysOnTop === "boolean") panelPinned = saved.alwaysOnTop;
      if (typeof saved.model === "string") els.modelSelect.value = saved.model;
      if (typeof saved.resolution === "string") els.resolutionSelect.value = saved.resolution;
      if (typeof saved.quality === "string") els.qualitySelect.value = saved.quality;
      if (typeof saved.size === "string") els.sizeSelect.value = saved.size;
    }
  } catch (e) {}
  updateAreaStatus();
}

async function saveSettings() {
  var promptType = els.libraryPromptPanel.classList.contains("hidden") ? "custom" : "library";
  var data = {
    mode: "auto", promptType: promptType,
    promptCustom: els.customPromptInput.value,
    promptLibraryId: els.customPromptInput.dataset.libraryPromptId || null,
    promptLibraryName: els.customPromptInput.dataset.libraryPromptName || "",
    cropPercent: hasCropArea ? cropPercent : { x: 0, y: 0, w: 0, h: 0 },
    model: els.modelSelect.value, resolution: els.resolutionSelect.value,
    quality: els.qualitySelect.value, size: els.sizeSelect.value,
    n: 1, display: savedDisplay,
  };
  try { localStorage.setItem("screenshot_settings", JSON.stringify(data)); } catch (e) {}
  if (desktop) {
    try { await fetch("/api/screenshot-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
    catch (e) { console.error("[设置保存]", e); }
  }
}

async function loadApiKey() {
  if (desktop) {
    try { var result = await desktop.getApiKey(); apiKey = result.apiKey || ""; return; } catch (e) {}
  }
  try {
    var raw = localStorage.getItem("webimage.pages.v2");
    if (!raw) return;
    var data = JSON.parse(raw);
    var activeId = data.activePageId;
    var page = (data.pages || []).find(function(p) { return p.id === activeId; });
    apiKey = (page && page.data && page.data.settings && page.data.settings.apiKey) || "";
  } catch (e) {}
}

function getActivePrompt() {
  var libId = els.customPromptInput.dataset.libraryPromptId;
  if (libId) {
    var item = libraryItems.find(function(x) { return x.id === libId; });
    return item ? item.content : "";
  }
  return els.customPromptInput.value.trim();
}

function updatePromptDisplay() {
  els.promptDisplay.textContent = getActivePrompt() || "未设置提示词";
}

function updateAreaStatus() {
  if (hasCropArea) {
    els.areaStatus.textContent = Math.round(cropPercent.x) + "% " + Math.round(cropPercent.y) + "% " + Math.round(cropPercent.w) + "%x" + Math.round(cropPercent.h) + "%";
    els.areaStatus.className = "area-inline set";
    els.areaBadge.classList.remove("hidden");
  } else {
    els.areaStatus.textContent = "未设置区域";
    els.areaStatus.className = "area-inline";
    els.areaBadge.classList.add("hidden");
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderLibraryList() {
  els.libraryPromptList.innerHTML = "";
  var currentId = els.customPromptInput.dataset.libraryPromptId;
  for (var i = 0; i < libraryItems.length; i++) {
    var item = libraryItems[i];
    var div = document.createElement("div");
    div.className = "library-item" + (item.id === currentId ? " selected" : "");
    div.innerHTML = '<div class="item-name">' + escapeHtml(item.name) + '</div><div class="item-preview">' + escapeHtml(item.content.substring(0, 60)) + '</div>';
    div.addEventListener("click", (function(id, name, content) {
      return function() {
        els.customPromptInput.dataset.libraryPromptId = id;
        els.customPromptInput.dataset.libraryPromptName = name;
        els.customPromptInput.value = content;
        renderLibraryList();
        updatePromptDisplay();
        saveSettings();
        els.promptEditor.classList.add("hidden");
      };
    })(item.id, item.name, item.content));
    els.libraryPromptList.appendChild(div);
  }
  if (!libraryItems.length) {
    els.libraryPromptList.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:12px">素材库暂无文字素材</div>';
  }
}

async function loadLibrary() {
  try {
    var resp = await fetch("/api/custom-library", { cache: "no-store" });
    if (resp.ok) { var data = await resp.json(); libraryItems = data.textTemplates || []; }
  } catch (e) {}
}

function loadTheme() {
  try {
    var raw = localStorage.getItem("webimage.pages.v2");
    if (!raw) return;
    var data = JSON.parse(raw);
    var activeId = data.activePageId;
    var page = (data.pages || []).find(function(p) { return p.id === activeId; });
    var t = (page && page.data && page.data.settings && page.data.settings.theme) || "light";
    if (t !== theme) { theme = t; document.body.className = "theme-" + theme; }
  } catch (e) {}
}

// ========== 桌面捕捉 ==========

async function doCapture() {
  if (desktop) {
    var result = await desktop.captureRegion({ mode: "auto", display: savedDisplay, cropPercent: cropPercent });
    if (!result || result.cancelled) return;
    capturedFrameData = result.dataUrl;
    capturedFrameSize = { w: result.width, h: result.height };
    cropPercent = result.cropPercent;
    cropPixels = {
      x: Math.round(cropPercent.x / 100 * result.width),
      y: Math.round(cropPercent.y / 100 * result.height),
      w: Math.round(cropPercent.w / 100 * result.width),
      h: Math.round(cropPercent.h / 100 * result.height),
    };
    savedDisplay = result.display;
    hasCropArea = true;
    updateAreaStatus();
    await saveSettings();
    var cropped = await cropImage(capturedFrameData);
    showPreview(cropped);
  }
}

async function doSetArea() {
  if (desktop) {
    var result = await desktop.captureRegion({ mode: "manual" });
    if (!result || result.cancelled) return;
    capturedFrameData = result.dataUrl;
    capturedFrameSize = { w: result.width, h: result.height };
    cropPercent = result.cropPercent;
    savedDisplay = result.display;
    hasCropArea = true;
    updateAreaStatus();
    await saveSettings();
    showPreview(result.dataUrl);
  }
}

function showPreview(dataUrl) {
  ensureExpanded();
  els.previewArea.classList.remove("hidden");
  els.panel.classList.add("capturing");
  var canvas = els.previewCanvas;
  var img = new Image();
  img.onload = function() {
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
  };
  img.src = dataUrl;
}

// ========== AI 生成 ==========

function getPayload(prompt, imageB64) {
  var m = els.modelSelect.value || "gpt-image-2";
  var p = { model: m, prompt: prompt || "generate an image", n: 1, size: els.sizeSelect.value || "1:1", resolution: els.resolutionSelect.value || "1k" };
  if (m === "gpt-image-2") p.quality = els.qualitySelect.value || "low";
  if (imageB64) p.image_urls = [imageB64];
  p._apiKey = apiKey;
  return p;
}

async function submitOne(payload) {
  var r = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  var d = await r.json();
  if (d.error) throw new Error(d.error.message || "提交失败");
  if (d.data && d.data[0] && d.data[0].url) return { direct: d.data[0].url };
  if (d.data && d.data[0] && d.data[0].b64_json) return { directBase64: d.data[0].b64_json };
  if (d.data && d.data[0] && d.data[0].task_id) return { taskId: d.data[0].task_id };
  throw new Error("未获取到任务ID或返回内容");
}

async function pollOne(taskId) {
  for (var i = 0; i < POLL_MAX; i++) {
    if (currentPollTimer === null) throw new Error("任务已取消");
    await new Promise(function(r) { currentPollTimer = setTimeout(r, POLL_INTERVAL); });
    if (currentPollTimer === null) throw new Error("任务已取消");
    var r = await fetch("/api/task/" + encodeURIComponent(taskId) + "?apiKey=" + encodeURIComponent(apiKey));
    var d = await r.json();
    if (!d.data) continue;
    if (d.data.status === "completed") {
      var imgs = d.data.result && d.data.result.images;
      if (imgs && imgs.length) {
        var urls = []; for (var j = 0; j < imgs.length; j++) { var u = imgs[j].url; urls.push(Array.isArray(u) ? u[0] : u); }
        return urls;
      }
      throw new Error("任务完成但未返回图片");
    }
    if (d.data.status === "failed") throw new Error(d.data.error || "任务失败");
    els.progressBar.value = d.data.progress || 0;
    els.statusText.textContent = "生成中... " + (d.data.progress || 0) + "%";
  }
  throw new Error("任务超时（超过6分钟）");
}

async function downloadOne(url) {
  var r = await fetch("/api/download-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: url }) });
  var d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.base64;
}

async function doGenerate() {
  if (isGenerating) { toast("正在生成中，请稍后"); return; }
  if (!apiKey) { toast("请在 CanvasFlow 设置中填入 API Key"); return; }
  var prompt = getActivePrompt();
  if (!prompt) { toast("请设置提示词"); return; }
  if (!hasCropArea) { toast("请先设置截取区域"); return; }

  if (!capturedFrameData) { toast("请先截图"); return; }

  var cropped = await cropImage(capturedFrameData);

  isGenerating = true; currentPollTimer = {}; results = [];
  els.resultList.innerHTML = "";
  els.resultArea.classList.remove("hidden");
  ensureExpanded();
  els.statusBar.classList.remove("hidden");
  els.statusText.textContent = "提交中...";
  els.progressBar.value = 0;
  if (desktop) desktop.setGenerationActive(true);

  try {
    var submitted = await submitOne(getPayload(prompt, cropped));
    console.log("[生成] 已提交", submitted);
    var urls;
    if (submitted.direct) urls = [submitted.direct];
    else if (submitted.directBase64) { results.push({ base64: "data:image/png;base64," + submitted.directBase64, fileName: "generated_" + Date.now() + ".png", mime: "image/png" }); }
    else if (submitted.taskId) {
      els.statusText.textContent = "等待处理...";
      urls = await pollOne(submitted.taskId);
    }
    if (urls) {
      for (var i = 0; i < urls.length; i++) {
        els.statusText.textContent = "下载 " + (i + 1) + "/" + urls.length;
        results.push({ base64: await downloadOne(urls[i]), fileName: "generated_" + Date.now() + "_" + i + ".png", mime: "image/png" });
      }
    }
    renderResults();
    els.statusBar.classList.add("hidden");
  } catch (e) {
    console.error("[生成失败]", e);
    els.statusBar.classList.add("hidden");
    toast("生成失败: " + (e.message || "未知错误") + "。请检查网络和 API Key");
  } finally {
    isGenerating = false; currentPollTimer = null;
    if (desktop) desktop.setGenerationActive(false);
  }
}

function renderResults() {
  ensureExpanded();
  els.resultArea.classList.remove("hidden");
  els.resultList.innerHTML = "";
  for (var i = 0; i < results.length; i++) {
    var div = document.createElement("div");
    div.className = "result-item";
    var img = document.createElement("img");
    img.src = results[i].base64; img.alt = "结果 " + (i + 1);
    div.appendChild(img);
    div.addEventListener("click", (function(idx) { return function() { showFullPreview(idx); }; })(i));
    els.resultList.appendChild(div);
  }
}

function showFullPreview(index) {
  var overlay = document.createElement("div"); overlay.className = "full-preview";
  var img = document.createElement("img"); img.src = results[index].base64;
  overlay.appendChild(img);
  overlay.addEventListener("click", function() { overlay.remove(); });
  document.body.appendChild(overlay);
}

async function saveResult(index) {
  var item = results[index];
  try {
    var response = await fetch("/api/save-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: [{ name: item.fileName, data: item.base64.replace(/^data:[^,]+,/, "") }] }) });
    var result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "保存失败");
    toast("已保存");
  } catch (error) { toast("保存失败: " + error.message); }
}

function copyResult(index) {
  var img = new Image();
  img.onload = function() {
    var c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    c.toBlob(function(blob) {
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function() { toast("已复制"); }).catch(function() { toast("复制失败"); });
    });
  };
  img.src = results[index].base64;
}

function deleteResult(index) { results.splice(index, 1); renderResults(); if (!results.length) els.resultArea.classList.add("hidden"); }

// ========== 面板控制 ==========

function toggleCompact() {
  els.panel.classList.toggle("compact");
  if (els.panel.classList.contains("compact")) els.expandedBody.classList.add("hidden");
  else els.expandedBody.classList.remove("hidden");
  if (desktop) desktop.setPanelCompact(els.panel.classList.contains("compact"));
}

function togglePromptEditor() {
  var editor = els.promptEditor;
  if (editor.classList.contains("hidden")) {
    editor.classList.remove("hidden");
    if (els.customPromptInput.dataset.libraryPromptId) {
      els.promptCustomTab.classList.remove("active"); els.promptLibraryTab.classList.add("active");
      els.customPromptPanel.classList.add("hidden"); els.libraryPromptPanel.classList.remove("hidden");
      renderLibraryList();
    }
  } else { editor.classList.add("hidden"); }
}

// ========== 日志 ==========

function appendLog(entry) {
  var pre = els.logOutput;
  pre.textContent += "[" + entry.time + "] [" + entry.level + "] " + entry.message + "\n";
  if (pre.textContent.length > 8000) pre.textContent = pre.textContent.slice(-6000);
  pre.scrollTop = pre.scrollHeight;
}

// ========== Init ==========

async function init() {
  els.panel = $("panel");
  els.header = $("header");
  els.expandedBody = $("expandedBody");
  els.previewArea = $("previewArea");
  els.previewTitle = $("previewTitle");
  els.previewCanvas = $("previewCanvas");
  els.statusBar = $("statusBar");
  els.statusText = $("statusText");
  els.progressBar = $("progressBar");
  els.resultArea = $("resultArea");
  els.resultList = $("resultList");
  els.errorToast = $("errorToast");
  els.promptEditor = $("promptEditor");
  els.promptDisplay = $("promptDisplay");
  els.customPromptInput = $("customPromptInput");
  els.customPromptPanel = $("customPromptPanel");
  els.libraryPromptPanel = $("libraryPromptPanel");
  els.libraryPromptList = $("libraryPromptList");
  els.promptCustomTab = document.querySelector('.tab-btn[data-source="custom"]');
  els.promptLibraryTab = document.querySelector('.tab-btn[data-source="library"]');
  els.modelSelect = $("modelSelect");
  els.resolutionSelect = $("resolutionSelect");
  els.qualitySelect = $("qualitySelect");
  els.sizeSelect = $("sizeSelect");
  els.areaStatus = $("areaStatus");
  els.areaBadge = $("areaBadge");
  els.logOutput = $("logOutput");
  els.portText = $("portText");
  els.versionText = $("versionText");

  await loadApiKey(); loadTheme(); await loadSettings();
  await loadLibrary();
  updatePromptDisplay(); updateAreaStatus();

  // Pin toggle
  $("pinBtn").classList.toggle("active", panelPinned);
  $("pinBtn").title = panelPinned ? "取消置顶" : "置于顶层";
  $("pinBtn").addEventListener("click", async function() {
    panelPinned = !panelPinned;
    var response = desktop ? await desktop.setPanelPinned(panelPinned) : { ok: false };
    if (!response.ok) { panelPinned = !panelPinned; toast("置顶设置失败"); return; }
    $("pinBtn").classList.toggle("active", panelPinned);
    $("pinBtn").title = panelPinned ? "取消置顶" : "置于顶层";
  });

  // Title buttons
  $("closeBtn").addEventListener("click", function() { if (desktop) desktop.closePanel(); else window.close(); });
  $("collapseBtn").addEventListener("click", toggleCompact);
  $("expandBtn").addEventListener("click", function() { els.panel.classList.remove("compact"); els.expandedBody.classList.remove("hidden"); if (desktop) desktop.setPanelCompact(false); loadTheme(); });

  // Toolbar
  $("captureBtn").addEventListener("click", doCapture);
  $("compactCaptureBtn").addEventListener("click", doCapture);
  $("setAreaBtn").addEventListener("click", doSetArea);
  $("compactSetAreaBtn").addEventListener("click", doSetArea);
  $("generateBtn").addEventListener("click", doGenerate);
  $("compactGenerateBtn").addEventListener("click", doGenerate);

  // Prompt
  $("editPromptBtn").addEventListener("click", togglePromptEditor);
  $("savePromptBtn").addEventListener("click", function() { delete els.customPromptInput.dataset.libraryPromptId; delete els.customPromptInput.dataset.libraryPromptName; els.promptEditor.classList.add("hidden"); updatePromptDisplay(); saveSettings(); });
  $("cancelPromptBtn").addEventListener("click", function() { els.promptEditor.classList.add("hidden"); });
  els.promptCustomTab.addEventListener("click", function() { els.promptCustomTab.classList.add("active"); els.promptLibraryTab.classList.remove("active"); els.customPromptPanel.classList.remove("hidden"); els.libraryPromptPanel.classList.add("hidden"); });
  els.promptLibraryTab.addEventListener("click", function() { els.promptLibraryTab.classList.add("active"); els.promptCustomTab.classList.remove("active"); els.customPromptPanel.classList.add("hidden"); els.libraryPromptPanel.classList.remove("hidden"); renderLibraryList(); });

  // Preview
  $("reCaptureBtn").addEventListener("click", function() { els.previewArea.classList.add("hidden"); els.panel.classList.remove("capturing"); doCapture(); });
  $("confirmCaptureBtn").addEventListener("click", function() { els.previewArea.classList.add("hidden"); els.panel.classList.remove("capturing"); });
  $("cancelPreviewBtn").addEventListener("click", function() { els.previewArea.classList.add("hidden"); els.panel.classList.remove("capturing"); });

  // Results
  $("saveResultBtn").addEventListener("click", function() { if (results.length) saveResult(results.length - 1); });
  $("copyResultBtn").addEventListener("click", function() { if (results.length) copyResult(results.length - 1); });
  $("deleteResultBtn").addEventListener("click", function() { if (results.length) deleteResult(results.length - 1); });

  // Footer actions
  $("openCanvasBtn").addEventListener("click", function() {
    if (desktop) {
      desktop.openCanvas().then(function(r) {
        if (r.ok) toast("已复制画板地址，请在浏览器中切换");
      });
    } else { window.open("/", "_blank"); }
  });
  $("openExportBtn").addEventListener("click", function() { if (desktop) desktop.openExportFolder(); else toast("导出文件夹仅在桌面版可用"); });
  $("exitBtn").addEventListener("click", function() { if (desktop) desktop.exitApp(); else window.close(); });

  // Log toggle
  $("toggleLogsBtn").addEventListener("click", function() {
    var section = $("logSection");
    section.classList.toggle("collapsed");
    $("logOutput").classList.toggle("hidden", section.classList.contains("collapsed"));
    $("toggleLogsBtn").textContent = section.classList.contains("collapsed") ? "日志 ▸" : "日志 ▾";
  });

  // Settings change → save
  els.modelSelect.addEventListener("change", saveSettings);
  els.resolutionSelect.addEventListener("change", saveSettings);
  els.qualitySelect.addEventListener("change", saveSettings);
  els.sizeSelect.addEventListener("change", saveSettings);

  // Desktop IPC events
  if (desktop) {
    desktop.onStatus(function(status) {
      els.portText.textContent = status.port || "--";
      els.versionText.textContent = status.version || "--";
      els.statusBadge.textContent = status.running ? "运行中" : "已停止";
      els.statusBadge.className = "badge " + (status.running ? "" : "off");
      els.compactBadge.textContent = status.running ? "OK" : "OFF";
      els.compactBadge.className = "badge small " + (status.running ? "" : "off");
    });
    desktop.onLog(function(entry) { appendLog(entry); });
    var status = await desktop.getStatus();
    els.portText.textContent = status.port || "--";
    els.versionText.textContent = status.version || "--";
    els.statusBadge.textContent = status.running ? "运行中" : "已停止";
    els.statusBadge.className = "badge " + (status.running ? "" : "off");
    els.compactBadge.className = "badge small " + (status.running ? "" : "off");
  }

  setInterval(loadTheme, 3000);
  window.addEventListener("beforeunload", function() { if (desktop) desktop.setGenerationActive(false); });
}

init().catch(function(e) { console.error("[面板初始化失败]", e); });
