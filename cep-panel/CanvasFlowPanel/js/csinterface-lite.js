// 精简版 CSInterface：只封装 CEP 面板最需要的 evalScript / 系统路径。
// 接口形状与 Adobe 官方 CSInterface.js 保持一致，可直接替换为官方完整版。
function CSInterface() {}

CSInterface.EVAL_SCRIPT_ERROR = "EvalScript error.";

CSInterface.SystemPath = {
  USER_DATA: "userData",
  COMMON_FILES: "commonFiles",
  MY_DOCUMENTS: "myDocuments",
  APPLICATION: "application",
  EXTENSION: "extension",
  HOST_APPLICATION: "hostApplication"
};

CSInterface.prototype.evalScript = function (script, callback) {
  callback = callback || function () {};
  if (window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === "function") {
    window.__adobe_cep__.evalScript(script, callback);
  } else {
    callback(CSInterface.EVAL_SCRIPT_ERROR);
  }
};

CSInterface.prototype.getHostEnvironment = function () {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.getHostEnvironment !== "function") return null;
  try {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment());
  } catch (error) {
    return null;
  }
};

CSInterface.prototype.getSystemPath = function (pathType) {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.getSystemPath !== "function") return "";
  var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
  if (path.indexOf("file://") === 0) path = path.substring("file://".length);
  // Windows 下 file:// 形如 /C:/...，去掉开头的斜杠
  if (/^\/[A-Za-z]:/.test(path)) path = path.substring(1);
  return path;
};
