// One receiver per service; focus chooses the destination, heartbeat keeps it alive.
let receiver = "", seenAt = 0;
const items = new Map();
module.exports = function browserTransfer(payload) {
  const now = Date.now();
  for (const [id, item] of items) if (now - item.createdAt > 600000) items.delete(id);
  const ready = !!receiver && now - seenAt < 120000;
  if (payload.action === "probe") return { ready };
  if (payload.action === "poll") {
    if (!payload.receiver || typeof payload.receiver !== "string") throw new Error("缺少接收窗口");
    if (!ready || payload.focused || receiver === payload.receiver) {
      if (!ready || payload.focused) receiver = payload.receiver;
      if (receiver === payload.receiver) seenAt = now;
    }
    return { items: receiver === payload.receiver ? [...items.values()].filter(item => item.receiver === receiver) : [] };
  }
  if (payload.action === "ack") {
    if (items.get(payload.id)?.receiver === payload.receiver) items.delete(payload.id);
    return { ok: true };
  }
  if (payload.action !== "send") throw new Error("未知网页传送操作");
  if (!ready) throw new Error("请先打开 CanvasFlow 画布");
  const kind = payload.kind === "text" ? "text" : "image";
  const sourceUrl = typeof payload.sourceUrl === "string" && /^https?:\/\//i.test(payload.sourceUrl) ? payload.sourceUrl.slice(0, 4096) : "";
  const value = kind === "text" ? payload.text : payload.image;
  if (kind === "text") {
    if (typeof value !== "string" || !value.trim() || value.length > 200000) throw new Error("文字为空或超过 20 万字");
  } else if (typeof value !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(value) || value.length > 14000000) {
    throw new Error("图片格式不支持或超过 10MB");
  }
  if (items.size >= 8) throw new Error("待接收内容过多，请回画布后重试");
  const id = require("crypto").randomUUID();
  items.set(id, { id, kind, ...(kind === "text" ? { text: value } : { image: value }), sourceUrl, receiver, createdAt: now });
  return { ok: true, id };
};
