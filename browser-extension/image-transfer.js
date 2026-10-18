// Independent of the generation bridge: available on ordinary web pages too.
if (!window.__canvasflowImageTransfer) {
  window.__canvasflowImageTransfer = true;
  let drag = null, busy = false, noticeTimer;
  const host = document.createElement("div");
  // Keep the notification out of the site's layout and native drag hit testing.
  host.style.cssText = "all: initial; position: fixed; width: 0; height: 0; pointer-events: none; z-index: 300;";
  const root = host.attachShadow({ mode: "closed" });
  const tokens = document.createElement("style");
  tokens.textContent = `:root { --canvasflow-transfer-panel: #ffffff; --canvasflow-transfer-text: #202124; --canvasflow-transfer-line: #dadce0; }
    .theme-dark { --canvasflow-transfer-panel: #242424; --canvasflow-transfer-text: #f2f2f2; --canvasflow-transfer-line: #555555; }
    @media (prefers-color-scheme: dark) { :root:not(.theme-light) { --canvasflow-transfer-panel: #242424; --canvasflow-transfer-text: #f2f2f2; --canvasflow-transfer-line: #555555; } }`;
  document.documentElement.append(tokens);
  const style = document.createElement("style");
  style.textContent = `div { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 300;
      padding: 12px 16px; border: 1px solid var(--canvasflow-transfer-line); border-radius: 8px;
      background: var(--canvasflow-transfer-panel); color: var(--canvasflow-transfer-text); font-size: 14px; line-height: 1.5; pointer-events: none; }
    [hidden] { display: none; }`;
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  root.append(style, notice);
  document.documentElement.append(host);
  function show(text, timeout = 0) {
    clearTimeout(noticeTimer);
    const content = `CanvasFlow：${text}`;
    if (notice.textContent !== content) notice.textContent = content;
    if (notice.hidden) notice.hidden = false;
    if (timeout) noticeTimer = setTimeout(() => { notice.hidden = true; }, timeout);
  }
  function reset() { drag = null; if (!busy) notice.hidden = true; }
  function armed(event) {
    return drag && event.clientY - drag.y >= 80 && event.clientY - drag.y > Math.abs(event.clientX - drag.x);
  }
  // Keep start/end intact for the browser's native drag image and site cleanup.
  // Isolate enter/leave/over while our gesture is active: galleries often repaint
  // every thumbnail on these events, even though the drop belongs to CanvasFlow.
  window.addEventListener("dragstart", event => {
    const image = event.target.closest?.("img");
    if (busy || !image || image.closest("[contenteditable='true']") || !image.currentSrc && !image.src) return;
    drag = { image, src: image.currentSrc || image.src, x: event.clientX, y: event.clientY };
    show("图片向下拖动 80 像素后松手，发送到画布（Esc 取消）");
  }, true);
  for (const type of ["dragenter", "dragleave"]) {
    window.addEventListener(type, event => {
      if (drag) event.stopImmediatePropagation();
    }, true);
  }
  window.addEventListener("dragover", event => {
    if (!drag) return;
    event.stopImmediatePropagation();
    if (armed(event)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      show("松手发送到画布（Esc 取消）");
    } else show("图片向下拖动 80 像素后松手，发送到画布（Esc 取消）");
  }, true);
  window.addEventListener("drop", async event => {
    if (!armed(event)) { reset(); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    const source = drag;
    busy = true;
    drag = null;
    show("正在传送图片…");
    try {
      let image = source.src;
      if (!image.startsWith("data:image/")) {
        if (image.startsWith("blob:")) {
          const response = await fetch(image);
          if (!response.ok) throw new Error("图片读取失败");
          const blob = await response.blob();
          if (blob.size > 10 * 1024 * 1024) throw new Error("图片超过 10MB");
          image = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("图片读取失败"));
            reader.readAsDataURL(blob);
          });
        } else {
          const result = await chrome.runtime.sendMessage({ type: "fetchImageDataUrl", url: image });
          if (!result?.ok) throw new Error(result?.error || "图片下载失败");
          image = result.dataUrl;
        }
      }
      const result = await chrome.runtime.sendMessage({ type: "sendImageToCanvas", image });
      if (!result?.ok) throw new Error(result?.error || "传送失败");
      show("图片已送达接收队列，画布将自动新增图片节点", 4000);
    } catch (error) { show(`传送失败：${error.message}`, 6000); }
    finally { busy = false; }
  }, true);
  window.addEventListener("dragend", () => {
    if (drag) reset();
  }, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape" && drag) reset(); }, true);
  window.addEventListener("blur", () => { if (drag) reset(); });
}
