"use strict";

// No Node, CEP, evalScript or unrestricted filesystem access in this module.
function localBase(value) {
  const match = /^http:\/\/(localhost|127\.0\.0\.1):(\d{1,5})\/?$/i.exec(String(value).trim());
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) {
    throw new Error("只支持本机画布地址，例如 http://127.0.0.1:5173");
  }
  return "http://" + match[1].toLowerCase() + ":" + Number(match[2]);
}

function parseBridge(raw) {
  const data = JSON.parse(String(raw).replace(/^\uFEFF/, ""));
  const port = Number(data.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !["desktop", "server"].includes(data.source)) {
    throw new Error("不是有效的 CanvasFlow bridge.json");
  }
  if (data.source === "desktop" && !/^[a-f0-9]{32}$/i.test(data.token || "")) {
    throw new Error("桥接文件缺少有效令牌，请重启 CanvasFlow");
  }
  return {
    base: "http://" + (data.source === "desktop" ? "localhost" : "127.0.0.1") + ":" + port,
    token: data.source === "desktop" ? data.token : "",
  };
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", url);
    xhr.timeout = options.timeout || 2500;
    if (options.token) xhr.setRequestHeader("X-CanvasFlow-Bridge", options.token);
    if (options.body) xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText); }
      catch (_) { reject(new Error("画布返回了无效响应（HTTP " + xhr.status + "）")); return; }
      if (xhr.status < 200 || xhr.status >= 300 || data.error) {
        const error = new Error("HTTP " + xhr.status + "：" + (data.error && (data.error.message || data.error) || "连接失败"));
        error.status = xhr.status;
        reject(error);
      } else resolve(data);
    };
    xhr.onerror = () => reject(new Error("无法连接画布，请确认 CanvasFlow 正在运行"));
    xhr.ontimeout = () => reject(new Error("连接画布超时，请检查后重试"));
    xhr.send(options.body ? JSON.stringify(options.body) : null);
  });
}

function createTransport({ fs, store, request = requestJson }) {
  async function probe(target) {
    try {
      const data = await request(target.base + "/api/ps/status", { token: target.token });
      return data.app === "CanvasFlow";
    } catch (error) {
      // Older Windows hosts already expose this read-only authenticated endpoint.
      // Never probe /api/ps/pending: that GET consumes images waiting for the canvas.
      if (target.token && error.status === 404) {
        const data = await request(target.base + "/api/cep/status", { token: target.token });
        return typeof data.sourceExists === "boolean";
      }
      return false;
    }
  }

  async function connect() {
    const manual = store.get("serverUrl");
    if (manual) {
      const target = { base: localBase(manual), token: "" };
      if (await probe(target)) return target;
      throw new Error("指定的服务器未响应，请检查地址并重启 CanvasFlow 服务");
    }
    const token = store.get("bridgeFileToken");
    if (token) {
      // Reopen and reread for EVERY operation: desktop restarts rotate both port and token.
      let target;
      try {
        const entry = await fs.getEntryForPersistentToken(token);
        target = parseBridge(await entry.read());
      } catch (_) {
        throw new Error("桥接文件授权失效或内容无效，请重新选择 bridge.json");
      }
      if (await probe(target)) return target;
      throw new Error("桌面版桥接未响应，请启动或重启 CanvasFlow，再重新连接");
    }
    // Same 20-port range as server.js. Only the non-consuming status endpoint is used.
    for (let start = 5173; start <= 5192; start += 4) {
      const targets = Array.from({ length: 4 }, (_, index) => ({ base: "http://127.0.0.1:" + (start + index), token: "" }));
      const results = await Promise.all(targets.map(target => probe(target)));
      const index = results.indexOf(true);
      if (index >= 0) return targets[index];
    }
    throw new Error("未找到画布。桌面版请先选择 bridge.json；服务器模式请启动最新 server.js");
  }

  async function chooseBridge() {
    const file = await fs.getFileForOpening({ types: ["json"], allowMultiple: false });
    if (!file) return false;
    if (file.name !== "bridge.json") throw new Error("请选择 CanvasFlowBridge 目录中的 bridge.json");
    parseBridge(await file.read());
    store.set("bridgeFileToken", await fs.createPersistentToken(file));
    store.set("serverUrl", "");
    return true;
  }

  async function send(target, payload) {
    const data = await request(target.base + "/api/ps/return-image", {
      method: "POST", token: target.token, body: payload, timeout: 120000,
    });
    if (data.ok !== true) throw new Error("画布没有确认接收图片");
  }
  return { connect, chooseBridge, send };
}

module.exports = { localBase, parseBridge, requestJson, createTransport };
