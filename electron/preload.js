"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canvasflowDesktop", {
  isDesktop: true,
  getStatus: () => ipcRenderer.invoke("desktop:get-status"),
  openCanvas: () => ipcRenderer.invoke("desktop:open-canvas"),
  openExportFolder: () => ipcRenderer.invoke("desktop:open-export"),
  checkUpdate: () => ipcRenderer.invoke("desktop:check-update"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:download-update"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  exitApp: () => ipcRenderer.invoke("desktop:exit"),
  clearLogs: () => ipcRenderer.invoke("desktop:clear-logs"),
  copyText: text => ipcRenderer.invoke("desktop:copy-text", String(text || "")),
  saveApiKey: key => ipcRenderer.invoke("desktop:save-api-key", String(key || "")),
  getApiKey: () => ipcRenderer.invoke("desktop:get-api-key"),
  captureRegion: options => ipcRenderer.invoke("desktop:capture-region", options || {}),
  // panel control APIs removed
  setGenerationActive: active => ipcRenderer.send("desktop:generation-active", !!active),
  completeSave: result => ipcRenderer.send("desktop:save-complete", result || {}),
  submitSelection: selection => ipcRenderer.send("capture:selection", selection || null),
  cancelSelection: () => ipcRenderer.send("capture:cancel"),
  onStatus: callback => ipcRenderer.on("desktop:status", (_event, value) => callback(value)),
  onLog: callback => ipcRenderer.on("desktop:log", (_event, value) => callback(value)),
  onDownloadProgress: callback => ipcRenderer.on("desktop:download-progress", (_event, value) => callback(value)),
  onSaveRequest: callback => ipcRenderer.on("desktop:save-request", (_event, value) => callback(value)),
  onCaptureInit: callback => ipcRenderer.on("capture:init", (_event, value) => callback(value)),
});
