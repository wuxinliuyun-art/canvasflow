// 预加载脚本：向前端暴露 window.canvasflowDesktop（与 Windows WebView2 版同名同形），
// canvas-runtime.js 据此进入桌面模式。截图（openScreenshotWindow）暂不提供，前端按缺失自动隐藏；
// 界面热更新（applyWebUpdate/webReady）与 PS 互传（launchInPs 等）已提供。
const { contextBridge, ipcRenderer } = require("electron");

const saveHandlers = [];

ipcRenderer.on("desktop-save-request", (_event, request) => {
  for (const callback of saveHandlers) {
    try { callback(request); } catch (_) { /* 页面回调异常不阻塞宿主 */ }
  }
});

function invoke(channel, payload, _timeoutMs) {
  // 与 Windows 版 invoke 形参兼容（第三参为超时毫秒，ipcRenderer.invoke 无超时语义，忽略）
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld("canvasflowDesktop", {
  isDesktop: true,
  apiRequest: (path, options = {}) => invoke("desktop:api", {
    path: String(path || ""),
    method: String(options.method || "GET"),
    body: typeof options.body === "string" ? options.body : "",
    apiKey: String(options.apiKey || ""),
  }),
  getApiKey: () => invoke("desktop:get-api-key"),
  saveApiKey: (apiKey, apiType) => invoke("desktop:save-api-key", { apiKey: String(apiKey || ""), apiType: String(apiType || "apimart") }),
  storeImage: (dataUrl, fileName, mime, category = "originals") => invoke("desktop:store-image", { dataUrl, fileName, mime, category }),
  readAsset: assetId => invoke("desktop:read-asset", { assetId: String(assetId || "") }),
  openFileLocation: filePath => invoke("desktop:open-file-location", { filePath: String(filePath || "") }),
  openAssetLocation: assetId => invoke("desktop:open-asset-location", { assetId: String(assetId || "") }),
  openOutputFolder: folderPath => invoke("desktop:open-output-folder", { folderPath: String(folderPath || "") }),
  copyImage: filePath => invoke("desktop:copy-image", { filePath: String(filePath || "") }),
  chooseOutputFolder: currentPath => invoke("desktop:choose-output-folder", { currentPath: String(currentPath || "") }),
  chooseProjectFolder: currentPath => invoke("desktop:choose-output-folder", { currentPath: String(currentPath || ""), purpose: "project" }),
  chooseLibraryFile: currentPath => invoke("desktop:choose-library-file", { currentPath: String(currentPath || "") }),
  chooseImageFile: currentPath => invoke("desktop:choose-image-file", { currentPath: String(currentPath || "") }),
  getPsPath: () => invoke("desktop:get-ps-path"),
  savePsPath: value => invoke("desktop:save-ps-path", { path: String(value || "") }),
  choosePsExe: () => invoke("desktop:choose-ps-exe"),
  launchInPs: (outputPath, fileName, assetId) => invoke("desktop:launch-in-ps", {
    outputPath: String(outputPath || ""),
    fileName: String(fileName || ""),
    assetId: String(assetId || ""),
  }),
  onSaveRequest: callback => { if (typeof callback === "function") saveHandlers.push(callback); },
  completeSave: result => invoke("desktop:save-complete", result || {}),
  webReady: () => invoke("desktop:web-ready", {}),
  applyWebUpdate: () => invoke("desktop:apply-web-update", {}, 600000),
});
