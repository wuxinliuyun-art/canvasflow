"use strict";

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const chunks = [];
  let part = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    part += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63]
      + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=")
      + (i + 2 < bytes.length ? alphabet[n & 63] : "=");
    if (part.length >= 32768) { chunks.push(part); part = ""; }
  }
  chunks.push(part);
  return chunks.join("");
}

// executeAsModal can drop the rejection message when the callback throws, which
// surfaced as the literal text "回传失败：undefined" in the panel. Keep selection
// validation outside the modal so its message never crosses that boundary, and
// re-check inside only as defence in depth.
function selectionProblem(kind, source, LayerKind) {
  if (kind !== "layer") return null;
  const layers = (source && source.activeLayers) || [];
  if (layers.length === 1) {
    return layers[0] && layers[0].kind !== LayerKind.GROUP ? null : "请选中单个图层（不能是图层组）";
  }
  return layers.length === 0
    ? "请先在 PS 中选中一个图层"
    : "请只选中一个图层后再回传（当前选中 " + layers.length + " 个）";
}

function createExporter(ps, storage) {
  return async function exportPng(kind) {
    // Reject before creating a temporary file, so invalid requests leave no artefacts.
    const opening = ps.app.activeDocument;
    if (!opening) throw new Error("PS 中没有打开的文档");
    let problem = null;
    try {
      problem = selectionProblem(kind, opening, ps.constants.LayerKind);
    } catch (_) {
      // Some hosts refuse layer descriptors outside a modal; the in-modal re-check still applies.
      problem = null;
    }
    if (problem) throw new Error(problem);
    const file = await (await storage.localFileSystem.getTemporaryFolder())
      .createFile("cf-" + Date.now() + ".png", { overwrite: false });
    let name;
    try {
      await ps.core.executeAsModal(async context => {
        const source = ps.app.activeDocument;
        if (!source) throw new Error("PS 中没有打开的文档");
        // The selection can change between the pre-check and the modal.
        const changed = selectionProblem(kind, source, ps.constants.LayerKind);
        if (changed) throw new Error(changed);
        const layer = source.activeLayers[0];
        name = source.name;
        let copy;
        try {
          if (kind === "layer") {
            copy = await ps.app.documents.add({
              name: "CanvasFlow layer export", width: source.width, height: source.height,
              resolution: source.resolution, mode: ps.constants.NewDocumentMode.RGB,
              fill: ps.constants.DocumentFill.TRANSPARENT, depth: 8,
            });
            await context.hostControl.registerAutoCloseDocument(copy.id);
            const exported = await layer.duplicate(copy);
            // Hidden source layers must still be exportable; only the copy is changed.
            exported.visible = true;
          } else {
            copy = await source.duplicate("CanvasFlow merged export");
            await context.hostControl.registerAutoCloseDocument(copy.id);
            // Preserve CEP's merged export semantics (opaque background).
            if (!copy.backgroundLayer || copy.layers.length > 1) await copy.flatten();
          }
          if (copy.mode !== ps.constants.DocumentMode.RGB) await copy.changeMode(ps.constants.ChangeMode.RGB);
          if (copy.bitsPerChannel !== ps.constants.BitsPerChannelType.EIGHT) copy.bitsPerChannel = ps.constants.BitsPerChannelType.EIGHT;
          await copy.saveAs.png(file, {}, true);
        } finally {
          // Close only the disposable document, including on conversion/save failure.
          // Auto-close also covers cancellation that prevents explicit modal cleanup.
          if (!context.isCancelled) {
            try { if (copy) await copy.closeWithoutSaving(); }
            finally { ps.app.activeDocument = source; }
          }
        }
      }, { commandName: "CanvasFlow 回传图片" });
      const bytes = await file.read({ format: storage.formats.binary });
      if (bytes.byteLength > 64 * 1024 * 1024) throw new Error("导出图片超过 64MB，请缩小文档后重试");
      const stem = String(name || "photoshop").replace(/[\\/:*?"<>|]/g, "_").replace(/\.[^.]*$/, "");
      return {
        name: "ps_" + stem + (kind === "layer" ? "_layer" : "") + "_" + Date.now() + ".png",
        data: "data:image/png;base64," + base64(bytes),
      };
    } finally {
      try { await file.delete(); } catch (_) { /* UXP also owns this temporary directory. */ }
    }
  };
}

module.exports = { base64, createExporter, selectionProblem };
