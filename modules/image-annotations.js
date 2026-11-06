// ===== 图片批注数据层（PR-5：数据层 + 发送准备；发送链路在 app.js 集成） =====
// 批注存放在图片节点的 node.imageAnnotations（旧版本项目的 node.comments 自动兼容读取）。
// 坐标一律为 0–1 归一化（相对图片宽高），与节点/图片像素尺寸解耦。
// 定位图插入规则：原始参考图保持原顺序，定位图统一追加到发送数组尾部。
// 本模块不依赖 app.js，可在 Node 单元测试中直接 require，也可经 <script> 在浏览器使用。
// 注意：与灯箱箭头配色标注（node.hasColorArrowNotes，上游 ARROW_NOTE_ENABLED=false 已隐藏）是两套独立机制，互不读写。
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CanvasFlowImageAnnotations = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  // 批注序号：①–⑳，超出后回退 (n)
  const number = index => index >= 1 && index <= 20 ? String.fromCodePoint(0x2460 + index - 1) : `(${index})`;

  function makeAnnotationId() {
    return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---- 数据规范化：任何来源（新批注、旧 comments、存档读入）统一到这里 ----
  function normalizeAnnotation(item, imageId, index) {
    if (!item || typeof item !== "object") return null;
    const raw = item.coordinates || item;
    const type = item.type === "rectangle" ? "rectangle" : "point";
    const coordinates = { x: clamp01(raw.x ?? .12), y: clamp01(raw.y ?? Math.min(.9, .15 + index * .12)) };
    if (type === "rectangle") {
      coordinates.width = Math.min(clamp01(raw.width ?? raw.w), 1 - coordinates.x);
      coordinates.height = Math.min(clamp01(raw.height ?? raw.h), 1 - coordinates.y);
      if (coordinates.width <= 0 || coordinates.height <= 0) return null;
    }
    return {
      annotationId: String(item.annotationId || item.id || `legacy-${imageId || "image"}-${index + 1}`),
      imageId: String(imageId || item.imageId || ""),
      type,
      coordinates,
      content: String(item.content ?? item.text ?? ""),
      index: index + 1,
      created: Number(item.created) || 0,
    };
  }

  // 读节点批注：优先 imageAnnotations，旧项目回退 comments；输出按数组顺序重新编号 1..n
  function readNodeAnnotations(node) {
    const raw = Array.isArray(node?.imageAnnotations) ? node.imageAnnotations : Array.isArray(node?.comments) ? node.comments : [];
    return raw.map((item, index) => normalizeAnnotation(item, node?.id, index)).filter(Boolean).map((item, index) => ({ ...item, index: index + 1 }));
  }

  // 写节点批注：规范化后落盘，并清除旧 comments 字段（避免双字段漂移）
  function writeNodeAnnotations(node, annotations) {
    node.imageAnnotations = (Array.isArray(annotations) ? annotations : [])
      .map((item, index) => normalizeAnnotation(item, node.id, index)).filter(Boolean)
      .map((item, index) => ({ ...item, index: index + 1 }));
    delete node.comments;
    return node.imageAnnotations;
  }

  // 从两个归一化点构建矩形（支持任意方向拖拽），结果钳制在 0–1
  function rectangleFromPoints(start, end) {
    const x = Math.min(clamp01(start.x), clamp01(end.x));
    const y = Math.min(clamp01(start.y), clamp01(end.y));
    return { x, y, width: Math.abs(clamp01(end.x) - clamp01(start.x)), height: Math.abs(clamp01(end.y) - clamp01(start.y)) };
  }

  // 批注位置的中文描述（进入提示词）
  function regionText(item) {
    const c = item.coordinates;
    const x = Math.round(c.x * 100), y = Math.round(c.y * 100);
    if (item.type === "rectangle") return `矩形区域：左上角 (${x}%, ${y}%)，宽 ${Math.round(c.width * 100)}%，高 ${Math.round(c.height * 100)}%`;
    return `定位点：(${x}%, ${y}%)`;
  }

  // 批注是否含有实际内容（空内容批注不参与定位图与提示词）
  function hasMeaningfulContent(annotations) {
    return (Array.isArray(annotations) ? annotations : []).some(item => String(item?.content || "").trim());
  }

  // 参考图数组中是否存在带有效批注的图（发送链路门控用：false 时原样透传，零影响）
  function hasAnnotatedReference(references) {
    return (Array.isArray(references) ? references : []).some(reference => hasMeaningfulContent(reference?.annotations));
  }

  // 复制/粘贴节点时批注 ID 全部重排（避免跨节点 ID 撞车），内容与坐标深拷贝保留
  function remapAnnotationIds(annotations) {
    return (Array.isArray(annotations) ? annotations : []).map((item, index) => {
      if (!item || typeof item !== "object") return item;
      return {
        ...item,
        coordinates: item.coordinates ? { ...item.coordinates } : item.coordinates,
        annotationId: makeAnnotationId(),
        index: index + 1,
      };
    });
  }

  // ---- 定位图几何（纯函数）：输入画布像素尺寸 + 规范化批注，输出每个标记的绘制参数 ----
  function computeLocatorGeometry(width, height, annotations, colors = {}) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    const line = Math.max(3, Math.round(Math.max(safeWidth, safeHeight) / 350));
    const font = Math.max(16, line * 5);
    const marker = colors.marker || "#2f80ed";
    const text = colors.text || "#ffffff";
    const markers = (Array.isArray(annotations) ? annotations : []).map((item, index) => {
      const c = item.coordinates || {};
      const x = clamp01(c.x) * safeWidth, y = clamp01(c.y) * safeHeight;
      const shape = item.type === "rectangle"
        ? { kind: "rectangle", x, y, width: clamp01(c.width) * safeWidth, height: clamp01(c.height) * safeHeight }
        : { kind: "point", x, y, radius: line * 2.5 };
      const label = number(index + 1);
      const labelX = Math.max(font, Math.min(safeWidth - font, x + font * .5));
      const labelY = Math.max(font, Math.min(safeHeight - font, y - font * .5));
      return { ...shape, label, labelX, labelY, labelRadius: font * .7 };
    });
    return { width: safeWidth, height: safeHeight, line, font, marker, text, markers };
  }

  // ---- 发送规划（纯函数）：决定哪些参考图需要定位图、上限是否允许 ----
  // references 的每项可为任意 imageRef 形状，批注从 .annotations 读取（空内容批注忽略）。
  // 返回 { slots, locatorAllowed, annotatedCount }；slots=[{ refIndex, annotations }]，与 references 下标对应。
  function planLocatorPlacement(references, maxImages = 9) {
    const list = Array.isArray(references) ? references : [];
    const slots = [];
    list.forEach((reference, refIndex) => {
      const annotations = (Array.isArray(reference?.annotations) ? reference.annotations : [])
        .map((item, index) => normalizeAnnotation(item, reference?._nodeId || reference?.assetId || "", index))
        .filter(item => item && String(item.content || "").trim())
        .map((item, index) => ({ ...item, index: index + 1 }));
      if (annotations.length) slots.push({ refIndex, annotations });
    });
    const locatorAllowed = list.length + slots.length <= maxImages;
    return { slots: locatorAllowed ? slots : [], locatorAllowed, annotatedCount: slots.length };
  }

  // ---- 发送执行（异步）：按规划逐个生成定位图并插入，返回最终发送数组与最终位置表 ----
  // createLocator(reference, annotations) 返回定位图 imageRef 形状（或 null/抛错=跳过该定位图，仅用坐标说明）。
  // 插入规则（2026-11-07 确定）：原始参考图保持原顺序在前，定位图按对应原图顺序统一追加到尾部——
  // 原图的序号不因定位图插入而改变；定位图序号 = 在最终数组中的实际位置。
  async function applyLocatorImages(references, slots, createLocator) {
    const list = Array.isArray(references) ? references : [];
    const locatorByRef = new Map();
    for (const slot of Array.isArray(slots) ? slots : []) {
      if (!locatorByRef.has(slot.refIndex)) {
        let locator = null;
        try { locator = await createLocator?.(list[slot.refIndex], slot.annotations) || null; } catch (error) { locator = null; }
        if (locator) locatorByRef.set(slot.refIndex, locator);
      }
    }
    // 一张定位图都没有（无批注、全部失败或超限跳过）：返回原数组引用，发送链路零影响
    if (!locatorByRef.size) {
      return { references: list, positions: list.map((_, index) => ({ original: index + 1, locator: 0 })) };
    }
    const output = list.slice();
    const positions = list.map((_, index) => ({ original: index + 1, locator: 0 }));
    // Map 保持插入序（= 原图下标升序）：定位图按对应原图顺序追加；失败的定位图不在 Map 中，自动跳过
    for (const [refIndex, locator] of locatorByRef) {
      output.push(locator);
      if (positions[refIndex]) positions[refIndex].locator = output.length;
    }
    return { references: output, positions };
  }

  // ---- 提示词合成（纯函数）：全局要求 + 每张带批注参考图的局部修改 + 保留要求 ----
  // positions 与 references（原始数组）下标对应，序号指向"最终发送数组"的 1-based 位置。
  function promptForReferences(globalPrompt, references, positions) {
    const lines = [];
    const global = String(globalPrompt || "").trim();
    if (global) lines.push(`全局要求：${global}`);
    const local = [];
    (Array.isArray(references) ? references : []).forEach((reference, imageIndex) => {
      const position = (Array.isArray(positions) ? positions : [])[imageIndex];
      const annotations = (reference?.annotations || []).filter(item => String(item.content || "").trim());
      if (!annotations.length) return;
      local.push(`原始参考图第 ${position.original} 张${position.locator ? `；第 ${position.locator} 张为对应的编号定位图` : ""}：`);
      annotations.forEach((item, index) => local.push(`- 批注${number(index + 1)} [${regionText(item)}]：${item.content.trim()}`));
    });
    if (!local.length) return global;
    lines.push("局部修改：", ...local);
    lines.push("保留要求：除非全局要求另有指示，尽量保持未标记区域不变。编号定位图仅用于识别区域，不要将编号、图钉或框线画入最终图片；以原始参考图为编辑依据。");
    return lines.join("\n");
  }

  // ---- 一步式提交准备（与历史实现同签名）：规划 + 定位图 + 提示词 ----
  // 返回额外带 locatorAllowed / annotatedCount，供调用方在超限跳过定位图时输出诊断。
  async function prepareSubmission(globalPrompt, references, createLocator, maxImages = 9) {
    const plan = planLocatorPlacement(references, maxImages);
    const applied = await applyLocatorImages(references, plan.slots, createLocator);
    return {
      prompt: promptForReferences(globalPrompt, references, applied.positions),
      references: applied.references,
      positions: applied.positions,
      locatorAllowed: plan.locatorAllowed,
      annotatedCount: plan.annotatedCount,
    };
  }

  // ---- DOM 定位图绘制（浏览器环境）：参考图 dataURL → 带编号标记的定位图 dataURL ----
  // 仅薄封装 computeLocatorGeometry 的结果；几何计算已由单元测试覆盖。
  async function createLocatorImage(dataUrl, annotations, colors = {}) {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("批注定位图无法读取"));
      image.src = dataUrl;
    });
    const scale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const geometry = computeLocatorGeometry(canvas.width, canvas.height, annotations, colors);
    ctx.lineWidth = geometry.line;
    ctx.font = `700 ${geometry.font}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const marker of geometry.markers) {
      ctx.fillStyle = geometry.marker;
      ctx.strokeStyle = geometry.marker;
      if (marker.kind === "rectangle") ctx.strokeRect(marker.x, marker.y, marker.width, marker.height);
      else { ctx.beginPath(); ctx.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(marker.labelX, marker.labelY, marker.labelRadius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = geometry.text;
      ctx.fillText(marker.label, marker.labelX, marker.labelY);
    }
    return canvas.toDataURL("image/png");
  }

  return {
    number, makeAnnotationId, normalizeAnnotation, readNodeAnnotations, writeNodeAnnotations,
    rectangleFromPoints, regionText, hasMeaningfulContent, hasAnnotatedReference, remapAnnotationIds,
    computeLocatorGeometry, planLocatorPlacement, applyLocatorImages, prepareSubmission,
    promptForReferences, createLocatorImage,
  };
});
