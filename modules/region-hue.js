(function () {
  const shadeBrushPixel = typeof module !== "undefined" && module.exports ? require("./fill-selection.js").writeSketchFillPixel : writeSketchFillPixel;
  function pixelHue(red, green, blue) {
    const high = Math.max(red, green, blue);
    const low = Math.min(red, green, blue);
    const span = high - low;
    if (!span) return { hue: 0, saturation: 0 };
    const sector = high === red ? (green - blue) / span : high === green ? (blue - red) / span + 2 : (red - green) / span + 4;
    return { hue: (sector * 60 + 360) % 360, saturation: span / high };
  }

  function dominantBaseColor(source, painted) {
    const buckets = new Map();
    for (let offset = 0; offset < source.length; offset += 4) {
      const weight = source[offset + 3] / 255 * painted[offset + 3] / 255;
      if (!weight) continue;
      const rgb = [source[offset], source[offset + 1], source[offset + 2]];
      const color = pixelHue(...rgb);
      const key = color.saturation < .08 ? `neutral-${Math.floor(Math.max(...rgb) / 32)}` : `hue-${Math.floor(color.hue / 15)}`;
      const bucket = buckets.get(key) || { weight: 0, channels: [0, 0, 0] };
      bucket.weight += weight;
      rgb.forEach((value, channel) => { bucket.channels[channel] += value * weight; });
      buckets.set(key, bucket);
    }
    let largest = null;
    for (const bucket of buckets.values()) if (!largest || bucket.weight > largest.weight) largest = bucket;
    return largest ? largest.channels.map(value => Math.round(value / largest.weight)) : null;
  }

  function identify(source, painted, tolerance, baseColor = null, paintedStride = 4) {
    const histogram = new Float64Array(72);
    for (let offset = 0; offset < source.length; offset += 4) {
      const coverage = painted[(offset / 4 + 1) * paintedStride - 1];
      if (!source[offset + 3] || !coverage) continue;
      const color = pixelHue(source[offset], source[offset + 1], source[offset + 2]);
      if (color.saturation >= .08) histogram[Math.floor(color.hue / 5) % 72] += color.saturation * coverage / 255;
    }
    let peak = -1;
    let best = 0;
    for (let bucket = 0; bucket < 72; bucket++) {
      let weight = 0;
      for (let delta = -2; delta <= 2; delta++) weight += histogram[(bucket + delta + 72) % 72];
      if (weight > best) { best = weight; peak = bucket; }
    }
    const mask = new Uint8ClampedArray(source.length / 4);
    const neutralBase = baseColor && pixelHue(...baseColor).saturation < .08;
    if (!baseColor && peak < 0) return { mask, count: 0 };
    const anchor = baseColor ? pixelHue(...baseColor).hue : peak * 5 + 2.5;
    let count = 0;
    for (let index = 0; index < mask.length; index++) {
      const offset = index * 4;
      const coverage = painted[(index + 1) * paintedStride - 1];
      if (!source[offset + 3] || !coverage) continue;
      const color = pixelHue(source[offset], source[offset + 1], source[offset + 2]);
      const distance = Math.abs(color.hue - anchor);
      const circular = Math.min(distance, 360 - distance);
      const difference = neutralBase ? Math.abs(Math.max(source[offset], source[offset + 1], source[offset + 2]) - Math.max(...baseColor)) / 2.84 : circular;
      if (neutralBase ? color.saturation > .15 : color.saturation < .08) continue;
      if (difference > tolerance) continue;
      const softness = Math.min(1, (tolerance - difference) / 4);
      mask[index] = Math.round(coverage * softness);
      if (mask[index]) count++;
    }
    return { mask, count };
  }

  function recolor(source, mask, degrees) {
    const output = new Uint8ClampedArray(source);
    if (!degrees) return output;
    for (let index = 0; index < mask.length; index++) {
      if (!mask[index] || !source[index * 4 + 3]) continue;
      const offset = index * 4;
      const red = source[offset], green = source[offset + 1], blue = source[offset + 2];
      const high = Math.max(red, green, blue), low = Math.min(red, green, blue);
      let chroma = high - low;
      let floor = low;
      if (pixelHue(red, green, blue).saturation < .08) {
        const strength = Math.min(1, Math.abs(degrees) / 20);
        const lightness = (high + low) / 510;
        const tintedLightness = lightness + (.16 - lightness * .32) * strength;
        chroma = (1 - Math.abs(2 * tintedLightness - 1)) * .65 * strength * 255;
        floor = tintedLightness * 255 - chroma / 2;
      }
      const hue = (pixelHue(red, green, blue).hue + degrees + 360) % 360 / 60;
      const intermediate = chroma * (1 - Math.abs(hue % 2 - 1));
      const channels = hue < 1 ? [chroma, intermediate, 0] : hue < 2 ? [intermediate, chroma, 0] : hue < 3 ? [0, chroma, intermediate] : hue < 4 ? [0, intermediate, chroma] : hue < 5 ? [intermediate, 0, chroma] : [chroma, 0, intermediate];
      const amount = mask[index] / 255;
      for (let channel = 0; channel < 3; channel++) output[offset + channel] = source[offset + channel] * (1 - amount) + (channels[channel] + floor) * amount;
    }
    return output;
  }

  function blurMaterialPixels(source, mask, width, height, pixelScale = 1) {
    const sigma = Math.max(.6, Math.min(4, 1.1 * pixelScale));
    const radius = Math.ceil(sigma * 2);
    const kernel = Array.from({ length: radius * 2 + 1 }, (_, index) => Math.exp(-((index - radius) ** 2) / (2 * sigma * sigma)));
    const horizontal = new Float32Array(source.length);
    const blurred = new Float32Array(mask.length * 3);
    for (let vertical = 0; vertical < height; vertical++) {
      for (let column = 0; column < width; column++) {
        const offset = (vertical * width + column) * 4;
        for (let delta = -radius; delta <= radius; delta++) {
          const neighbor = vertical * width + Math.max(0, Math.min(width - 1, column + delta));
          const weight = kernel[delta + radius] * mask[neighbor] / 255 * source[neighbor * 4 + 3] / 255;
          for (let channel = 0; channel < 3; channel++) horizontal[offset + channel] += source[neighbor * 4 + channel] * weight;
          horizontal[offset + 3] += weight;
        }
      }
    }
    for (let vertical = 0; vertical < height; vertical++) {
      for (let column = 0; column < width; column++) {
        const index = vertical * width + column;
        let weight = 0;
        for (let delta = -radius; delta <= radius; delta++) {
          const neighbor = (Math.max(0, Math.min(height - 1, vertical + delta)) * width + column) * 4;
          const factor = kernel[delta + radius];
          for (let channel = 0; channel < 3; channel++) blurred[index * 3 + channel] += horizontal[neighbor + channel] * factor;
          weight += horizontal[neighbor + 3] * factor;
        }
        for (let channel = 0; channel < 3; channel++) blurred[index * 3 + channel] = weight > 0 ? blurred[index * 3 + channel] / weight : source[index * 4 + channel];
      }
    }
    return blurred;
  }

  function adjustMaterial(source, mask, width, height, options = {}, cachedBlur = null) {
    const hue = Number(options.hue) || 0;
    const brightness = Math.max(-100, Math.min(100, Number(options.brightness) || 0));
    if (!brightness) return recolor(source, mask, hue);
    if (!mask.some(Boolean)) return new Uint8ClampedArray(source);
    const blurred = cachedBlur || blurMaterialPixels(source, mask, width, height, options.pixelScale || 1);
    const adjusted = new Uint8ClampedArray(source);
    const fullMask = new Uint8ClampedArray(mask.length);
    const exposure = 2 ** (brightness / 65);
    for (let index = 0; index < mask.length; index++) {
      if (!mask[index] || !source[index * 4 + 3]) continue;
      fullMask[index] = 255;
      const localLuma = (54 * blurred[index * 3] + 183 * blurred[index * 3 + 1] + 19 * blurred[index * 3 + 2]) / (256 * 255);
      const base = Math.max(.02, Math.min(.98, localLuma));
      const mapped = base * exposure / (1 - base + base * exposure);
      const lumaShift = (mapped - base) * 255;
      for (let channel = 0; channel < 3; channel++) {
        adjusted[index * 4 + channel] = source[index * 4 + channel] + lumaShift;
      }
    }
    const colored = recolor(adjusted, fullMask, hue);
    const output = new Uint8ClampedArray(source);
    for (let index = 0; index < mask.length; index++) {
      if (!mask[index] || !source[index * 4 + 3]) continue;
      const amount = mask[index] / 255;
      for (let channel = 0; channel < 3; channel++) output[index * 4 + channel] = source[index * 4 + channel] * (1 - amount) + colored[index * 4 + channel] * amount;
    }
    return output;
  }

  function materialSelection(source, coverage, rangeMode, tolerance, baseColor) {
    if (rangeMode === "base") return baseColor ? identify(source, coverage, tolerance, baseColor, 1) : { mask: new Uint8ClampedArray(coverage.length), count: 0 };
    const mask = new Uint8ClampedArray(coverage.length);
    let count = 0;
    for (let index = 0; index < mask.length; index++) {
      if (!source[index * 4 + 3]) continue;
      mask[index] = coverage[index];
      if (mask[index]) count++;
    }
    return { mask, count };
  }

  function paintMaterial(source, mask, hex, opacity = 100) {
    const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
    const output = new Uint8ClampedArray(source);
    const strength = Math.max(0, Math.min(100, opacity)) / 100;
    for (let index = 0; index < mask.length; index++) {
      if (!mask[index] || !source[index * 4 + 3]) continue;
      const amount = mask[index] / 255 * strength;
      shadeBrushPixel(output, source, index * 4, rgb, true);
      for (let channel = 0; channel < 3; channel++) output[index * 4 + channel] = source[index * 4 + channel] * (1 - amount) + output[index * 4 + channel] * amount;
    }
    return output;
  }

  function brushOverlayAlpha(coverage, sourceAlpha) { return Math.round(coverage * sourceAlpha / 255 * .45); }

  function createColorToolHistory(capture, restore, limit = 20) {
    const undo = [], redo = [];
    return {
      remember() { undo.push(capture()); if (undo.length > limit) undo.shift(); redo.length = 0; },
      undo() { if (!undo.length) return; redo.push(capture()); restore(undo.pop()); },
      redo() { if (!redo.length) return; undo.push(capture()); restore(redo.pop()); }
    };
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = { identify, recolor, dominantBaseColor, blurMaterialPixels, adjustMaterial, materialSelection, paintMaterial, brushOverlayAlpha, createColorToolHistory }; return; }

  async function openRegionHue(initialEditMode = "hue") {
    if (!lightboxPainting || document.querySelector(".region-hue-dialog")) return;
    const pageId = state.activePageId;
    const sourceNodeId = lightboxSourceNodeId;
    commitLightboxLastFill();
    setLightboxPaintMode("idle");
    clearLightboxCrop();
    const original = document.createElement("canvas");
    original.width = els.lightboxPaintCanvas.width;
    original.height = els.lightboxPaintCanvas.height;
    renderLightboxPaintComposite();
    original.getContext("2d").drawImage(els.lightboxPaintCanvas, 0, 0);
    const dialog = document.createElement("section");
    dialog.className = "quick-palette region-hue-dialog region-hue-inline";
    dialog.setAttribute("aria-label", "材质颜色修改");
    dialog.innerHTML = `<header class="quick-palette-row"><h2>材质颜色修改</h2><p>涂选区自动取主色 · 吸管可指定基色 · 支持黑白灰</p></header>
      <label class="region-hue-mode-row">作用范围 <select data-field="range-mode"><option value="base">按基色识别</option><option value="brush">直接使用笔刷范围</option></select></label>
      <label class="region-hue-mode-row">修改方式 <select data-field="edit-mode"><option value="hue">调色相</option><option value="paint">笔刷涂色</option></select></label>
      <div class="quick-palette-row region-hue-controls"><button type="button" data-action="pick" aria-pressed="false">吸管取色</button><span data-base-label>自动取主色</span></div>
      <label class="region-hue-base-row">基色 <span class="region-hue-base-swatch" aria-hidden="true"></span><input data-field="base" type="text" placeholder="#RRGGBB" maxlength="7" aria-label="输入待修改基色的六位 HEX 色号"></label>
      <div class="quick-palette-row region-hue-tools" role="group" aria-label="选区绘制工具">
        <button type="button" class="lightbox-icon-btn" data-action="brush" title="笔刷添加选区" aria-label="笔刷添加选区" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V4a3 3 0 0 1 6 0v7M5 11h14v5H5zM6 16v6h12v-6M10 19v3M14 19v3"/></svg></button>
        <button type="button" class="lightbox-icon-btn" data-action="erase" title="橡皮擦除选区" aria-label="橡皮擦除选区" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4-4a2 2 0 0 1 0-3L14 3a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L10 21ZM5 12l7 7M7 21h15"/></svg></button>
        <button type="button" data-action="clear">清空</button>
      </div>
      <label class="region-hue-size">笔刷大小 <input data-field="size" type="range" min="8" max="160" value="72"></label>
      <div class="palette-mask-surface"><canvas aria-label="换色预览"></canvas><canvas aria-label="处理范围笔刷"></canvas></div>
      <div class="quick-palette-row">
        <label>识别容差 <input data-field="tolerance" type="range" min="5" max="90" value="25"></label>
        <label><input data-field="painted" type="checkbox" checked>显示笔刷范围</label>
        <label><input data-field="compare" type="checkbox">对比原图</label>
      </div>
      <label class="region-hue-slider">色相 <input data-field="hue" type="range" min="-180" max="180" value="0"><output data-value="hue">0°</output></label>
      <label class="region-hue-slider" title="调整明暗基底，保留局部纹理及高光层次">明度 <input data-field="brightness" type="range" min="-100" max="100" value="0"><output data-value="brightness">0</output></label>
      <label class="region-hue-paint-row" title="沿用原自由上色笔刷，保留暗线、明暗与阴影">上色颜色 <input data-field="paint-color" type="color" aria-label="笔刷上色颜色"></label>
      <label class="region-hue-slider" data-paint-opacity>上色强度 <input data-field="paint-opacity" type="range" min="1" max="100" value="100"><output data-value="paint-opacity">100%</output></label>
      <div class="quick-palette-row region-hue-footer"><p role="status">请先用笔刷涂出处理区域。</p><button type="button" data-action="view-reset" title="只恢复图片的显示位置和缩放">图片复位</button><button type="button" data-action="reset" title="重置色相、明度并清除涂色范围">重置调整</button><button type="button" data-action="save">应用调整</button><button type="button" data-action="cancel">取消调整</button></div>`;
    const [preview, overlay] = dialog.querySelectorAll("canvas");
    const eventCanvas = els.lightboxPaintCanvas;
    const sessionEvents = new AbortController();
    const brushRing = document.createElement("div");
    brushRing.className = "region-material-brush-ring hidden";
    brushRing.setAttribute("aria-hidden", "true");
    document.body.append(brushRing);
    let brushPoint = null;
    function syncBrushRing(event) {
      if (event) brushPoint = { x: event.clientX, y: event.clientY };
      if (!brushPoint || picking || busy || lightboxPanSpaceDown || lightboxViewDrag) { brushRing.classList.add("hidden"); return; }
      const bounds = eventCanvas.getBoundingClientRect();
      const diameter = Number(field("size").value) * bounds.width / preview.width;
      brushRing.style.width = `${diameter}px`; brushRing.style.height = `${diameter}px`;
      brushRing.style.transform = `translate(${brushPoint.x}px, ${brushPoint.y}px) translate(-50%, -50%)`;
      brushRing.classList.remove("hidden");
    }
    const onCanvas = (name, handler) => eventCanvas.addEventListener(name, event => {
      event.stopImmediatePropagation();
      handler(event);
    }, { capture: true, signal: sessionEvents.signal });
    const ratio = Math.min(1, 1024 / Math.max(original.width, original.height));
    preview.width = overlay.width = Math.max(1, Math.round(original.width * ratio));
    preview.height = overlay.height = Math.max(1, Math.round(original.height * ratio));
    const context = preview.getContext("2d", { willReadFrequently: true });
    context.drawImage(original, 0, 0, preview.width, preview.height);
    const source = context.getImageData(0, 0, preview.width, preview.height);
    const brush = document.createElement("canvas");
    brush.width = preview.width; brush.height = preview.height;
    const brushContext = brush.getContext("2d", { willReadFrequently: true });
    const overlayContext = overlay.getContext("2d");
    const field = name => dialog.querySelector(`[data-field="${name}"]`);
    const action = name => dialog.querySelector(`[data-action="${name}"]`);
    field("edit-mode").value = initialEditMode;
    field("range-mode").value = initialEditMode === "paint" ? "brush" : "base";
    field("paint-color").value = els.lightboxPaintColor.value;
    field("painted").checked = initialEditMode !== "paint";
    let selection = { mask: new Uint8ClampedArray(preview.width * preview.height), count: 0 };
    let pointer = null, previous = null, frame = 0, busy = false, picking = false, baseColor = null, manualBase = false;
    let brushTool = "paint";
    let materialBlur = null;
    const adjustmentNames = ["hue", "brightness"];
    const adjustments = () => Object.fromEntries(adjustmentNames.map(name => [name, Number(field(name).value)]));
    const hasAdjustments = () => field("edit-mode").value === "paint" || adjustmentNames.some(name => Number(field(name).value) !== 0);
    const renderPixels = (pixels, mask, width, height, options, cached) => field("edit-mode").value === "paint" ? paintMaterial(pixels, mask, field("paint-color").value, Number(field("paint-opacity").value)) : adjustMaterial(pixels, mask, width, height, options, cached);
    const snapshot = () => brushContext.getImageData(0, 0, brush.width, brush.height);
    const toolHistory = createColorToolHistory(() => ({ brush: snapshot(), base: baseColor?.slice() || null, manual: manualBase, fields: Object.fromEntries([...dialog.querySelectorAll("[data-field]")].map(input => [input.dataset.field, input.type === "checkbox" ? input.checked : input.value])) }), state => {
      brushContext.putImageData(state.brush, 0, 0);
      baseColor = state.base?.slice() || null; manualBase = state.manual; picking = false;
      for (const [name, value] of Object.entries(state.fields)) { if (field(name).type === "checkbox") field(name).checked = value; else field(name).value = value; }
      els.lightboxPaintColor.value = field("paint-color").value;
      showBaseColor(); identifySelection();
    });
    function draw() {
      frame = 0;
      const options = adjustments();
      if (!materialBlur && selection.count && options.brightness && field("edit-mode").value === "hue") materialBlur = blurMaterialPixels(source.data, selection.mask, preview.width, preview.height);
      const pixels = field("compare").checked ? source.data : renderPixels(source.data, selection.mask, preview.width, preview.height, options, materialBlur);
      context.putImageData(new ImageData(pixels, preview.width, preview.height), 0, 0);
      overlayContext.clearRect(0, 0, overlay.width, overlay.height);
      if (!field("compare").checked) {
        const painted = snapshot().data;
        const theme = getComputedStyle(dialog);
        overlayContext.fillStyle = theme.getPropertyValue("--primary").trim();
        overlayContext.fillRect(0, 0, overlay.width, overlay.height);
        const tint = overlayContext.getImageData(0, 0, overlay.width, overlay.height);
        for (let index = 0; index < selection.mask.length; index++) {
          const offset = index * 4;
          tint.data[offset + 3] = field("painted").checked ? brushOverlayAlpha(painted[offset + 3], source.data[offset + 3]) : 0;
        }
        overlayContext.putImageData(tint, 0, 0);
      }
      for (const name of adjustmentNames) dialog.querySelector(`[data-value="${name}"]`).textContent = `${field(name).value}${name === "hue" ? "°" : ""}`;
      dialog.querySelector('[data-value="paint-opacity"]').textContent = `${field("paint-opacity").value}%`;
      const isPaint = field("edit-mode").value === "paint";
      for (const name of adjustmentNames) field(name).closest("label").classList.toggle("hidden", isPaint);
      dialog.querySelector(".region-hue-paint-row").classList.toggle("hidden", !isPaint);
      dialog.querySelector("[data-paint-opacity]").classList.toggle("hidden", !isPaint);
      const usesBase = field("range-mode").value === "base";
      field("base").closest("label").classList.toggle("hidden", !usesBase);
      field("tolerance").closest("label").classList.toggle("hidden", !usesBase);
      dialog.querySelector(".region-hue-controls").classList.toggle("hidden", !usesBase);
      action("pick").setAttribute("aria-pressed", String(picking));
      action("pick").textContent = picking ? "点击图片取色…" : "吸管取色";
      dialog.querySelector('[role="status"]').textContent = picking ? "请点击产品表面取色，取样来自原图。" : selection.count ? `实际修改 ${(selection.count / selection.mask.length * 100).toFixed(1)}% 的画面；${usesBase ? "笔刷与基色匹配范围取交集，同色的其他部件也可能匹配。" : "直接修改笔刷范围内所有非透明像素。"}` : "请涂出范围；按基色模式还会进一步筛选匹配颜色。";
      action("save").disabled = busy || !selection.count || !hasAdjustments() || pointer !== null;
      action("brush").setAttribute("aria-pressed", String(brushTool === "paint"));
      action("erase").setAttribute("aria-pressed", String(brushTool === "erase"));
      const mainContext = eventCanvas.getContext("2d");
      mainContext.clearRect(0, 0, eventCanvas.width, eventCanvas.height);
      mainContext.drawImage(preview, 0, 0, eventCanvas.width, eventCanvas.height);
      mainContext.drawImage(overlay, 0, 0, eventCanvas.width, eventCanvas.height);
      syncBrushRing();
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
    function identifySelection() {
      const painted = snapshot().data;
      if (!manualBase && pointer === null) {
        baseColor = dominantBaseColor(source.data, painted);
        showBaseColor();
      }
      const coverage = new Uint8ClampedArray(preview.width * preview.height);
      for (let index = 0; index < coverage.length; index++) coverage[index] = painted[index * 4 + 3];
      selection = materialSelection(source.data, coverage, field("range-mode").value, Number(field("tolerance").value), baseColor);
      materialBlur = null;
      schedule();
    }
    function showBaseColor() {
      const hex = baseColor ? "#" + baseColor.map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase() : "";
      field("base").value = hex;
      if (baseColor) dialog.style.setProperty("--region-base-color", hex);
      else dialog.style.removeProperty("--region-base-color");
      dialog.querySelector("[data-base-label]").textContent = manualBase ? "手动基色" : "自动取主色";
    }
    function setBaseColor(hex) {
      manualBase = true;
      baseColor = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
      showBaseColor();
      picking = false;
      identifySelection();
    }
    function paint(event) {
      const bounds = eventCanvas.getBoundingClientRect();
      const point = { x: (event.clientX - bounds.left) * overlay.width / bounds.width, y: (event.clientY - bounds.top) * overlay.height / bounds.height };
      brushContext.globalCompositeOperation = brushTool === "erase" ? "destination-out" : "source-over";
      brushContext.lineWidth = Number(field("size").value);
      brushContext.lineCap = "round";
      brushContext.beginPath();
      if (previous) { brushContext.moveTo(previous.x, previous.y); brushContext.lineTo(point.x, point.y); brushContext.stroke(); }
      else { brushContext.arc(point.x, point.y, brushContext.lineWidth / 2, 0, Math.PI * 2); brushContext.fill(); }
      previous = point;
      identifySelection();
    }
    onCanvas("pointerdown", event => {
      if (event.button !== 0 || pointer !== null || busy) return;
      toolHistory.remember();
      if (picking) {
        event.preventDefault();
        const bounds = eventCanvas.getBoundingClientRect();
        const horizontal = Math.max(0, Math.min(preview.width - 1, Math.floor((event.clientX - bounds.left) * preview.width / bounds.width)));
        const vertical = Math.max(0, Math.min(preview.height - 1, Math.floor((event.clientY - bounds.top) * preview.height / bounds.height)));
        const offset = (vertical * preview.width + horizontal) * 4;
        if (!source.data[offset + 3]) { toast("透明区域无法取色，请点击产品表面"); return; }
        const hex = "#" + [...source.data.slice(offset, offset + 3)].map(value => value.toString(16).padStart(2, "0")).join("");
        setBaseColor(hex);
        collectPickedEditorColor(hex);
        return;
      }
      field("compare").checked = false;
      field("painted").checked = field("edit-mode").value !== "paint";
      event.preventDefault(); pointer = event.pointerId; previous = null;
      eventCanvas.setPointerCapture(pointer); paint(event);
    });
    onCanvas("pointermove", event => { syncBrushRing(event); if (event.pointerId === pointer) paint(event); });
    onCanvas("pointerenter", syncBrushRing);
    onCanvas("pointerleave", () => { brushPoint = null; brushRing.classList.add("hidden"); });
    function finish() { if (pointer === null) return; pointer = previous = null; identifySelection(); }
    onCanvas("pointerup", finish);
    onCanvas("pointercancel", finish);
    onCanvas("lostpointercapture", finish);
    dialog.addEventListener("pointerdown", event => { if (!busy && event.target.closest("input,select")) toolHistory.remember(); });
    dialog.addEventListener("input", event => {
      if (event.target === field("paint-color")) els.lightboxPaintColor.value = field("paint-color").value;
      if (event.target === field("base")) {
        if (/^#[0-9a-f]{6}$/i.test(event.target.value)) setBaseColor(event.target.value);
      } else if (event.target === field("tolerance") || event.target === field("range-mode")) { picking = false; identifySelection(); }
      else {
        if (event.target === field("edit-mode")) { picking = false; field("painted").checked = false; }
        if ([...adjustmentNames, "paint-color", "paint-opacity"].some(name => event.target === field(name))) {
          field("painted").checked = false;
          field("compare").checked = false;
        }
        schedule();
      }
    });
    for (const name of adjustmentNames) field(name).addEventListener("pointerdown", () => { field("painted").checked = false; schedule(); });
    dialog.addEventListener("keydown", event => {
      event.stopPropagation();
      if (!busy && event.target.matches("input,select") && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key) && !event.repeat) toolHistory.remember();
      if (event.key === "[" || event.key === "]") { event.preventDefault(); field("size").value = Math.max(8, Math.min(160, Number(field("size").value) + (event.key === "[" ? -8 : 8))); syncBrushRing(); }
    });
    const surface = dialog.querySelector(".palette-mask-surface");
    surface.hidden = true;
    const hiddenControls = [document.getElementById("editorPalette"), document.getElementById("lightboxPaletteTools"), els.lightboxPaintToolbar];
    const previousHidden = hiddenControls.map(control => control.classList.contains("hidden"));
    hiddenControls.forEach(control => control.classList.add("hidden"));
    const sizeObserver = new ResizeObserver(schedule);
    const closeObserver = new MutationObserver(() => { if (!lightboxPainting || els.lightbox.classList.contains("hidden")) dialog.close(); });
    let closed = false;
    dialog.close = () => {
      if (closed) return;
      closed = true;
      brushRing.remove();
      sessionEvents.abort(); sizeObserver.disconnect(); closeObserver.disconnect(); cancelAnimationFrame(frame);
      hiddenControls.forEach((control, index) => control.classList.toggle("hidden", previousHidden[index]));
      dialog.remove();
      if (lightboxPainting) { renderLightboxPaintComposite(); syncLightboxPaletteTop(); }
    };
    action("cancel").onclick = () => dialog.close();
    action("view-reset").onclick = resetLightboxImageView;
    eventCanvas.addEventListener("canvasflow-image-view-change", () => { syncBrushRing(); schedule(); }, { signal: sessionEvents.signal });
    action("pick").onclick = () => { picking = !picking; schedule(); };
    action("brush").onclick = () => { brushTool = "paint"; picking = false; schedule(); };
    action("erase").onclick = () => { brushTool = "erase"; picking = false; schedule(); };
    action("reset").onclick = () => { toolHistory.remember(); for (const name of adjustmentNames) field(name).value = 0; if (field("edit-mode").value === "paint") brushContext.clearRect(0, 0, brush.width, brush.height); identifySelection(); };
    action("clear").onclick = () => { toolHistory.remember(); brushContext.clearRect(0, 0, brush.width, brush.height); identifySelection(); };
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!busy) dialog.close();
      } else if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase()) && !event.composedPath().some(element => element.matches?.("textarea,input:not([type='range']):not([type='checkbox']):not([type='color']),[contenteditable='true']"))) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!busy && pointer === null) { if (event.key.toLowerCase() === "y" || event.shiftKey) toolHistory.redo(); else toolHistory.undo(); }
      }
    }, { capture: true, signal: sessionEvents.signal });
    action("save").onclick = async () => {
      if (busy || pointer !== null || !selection.count || !hasAdjustments()) return;
      if (state.activePageId !== pageId || !lightboxPainting || lightboxSourceNodeId !== sourceNodeId) { toast("图片编辑会话已变化，请重新打开材质颜色修改"); dialog.close(); return; }
      busy = true;
      brushRing.classList.add("hidden");
      for (const control of dialog.querySelectorAll("button,input,select")) control.disabled = true;
      dialog.querySelector('[role="status"]').textContent = "正在按原图尺寸生成…";
      await new Promise(resolve => setTimeout(resolve, 0));
      try {
        const fullContext = original.getContext("2d", { willReadFrequently: true });
        const full = fullContext.getImageData(0, 0, original.width, original.height);
        const fullMask = new Uint8ClampedArray(original.width * original.height);
        const painted = snapshot().data;
        for (let vertical = 0; vertical < original.height; vertical++) {
          const row = Math.min(preview.height - 1, Math.floor(vertical * preview.height / original.height));
          for (let horizontal = 0; horizontal < original.width; horizontal++) fullMask[vertical * original.width + horizontal] = painted[(row * preview.width + Math.min(preview.width - 1, Math.floor(horizontal * preview.width / original.width))) * 4 + 3];
        }
        const exported = document.createElement("canvas");
        exported.width = original.width; exported.height = original.height;
        const fullSelection = materialSelection(full.data, fullMask, field("range-mode").value, Number(field("tolerance").value), baseColor);
        exported.getContext("2d").putImageData(new ImageData(renderPixels(full.data, fullSelection.mask, original.width, original.height, { ...adjustments(), pixelScale: original.width / preview.width }), original.width, original.height), 0, 0);
        const previousEdit = { base: lightboxEditBase, actions: lightboxPaintActions, fills: lightboxFillActions, placed: cloneLightboxPlacedImage(), selected: lightboxPlacedSelected, flipX: lightboxBaseFlipX, flipY: lightboxBaseFlipY };
        lightboxEditBase = exported;
        lightboxPaintActions = []; lightboxFillActions = []; lightboxPlacedImage = null; lightboxPlacedSelected = false;
        lightboxBaseFlipX = false; lightboxBaseFlipY = false;
        lightboxPaintOverlay.getContext("2d").clearRect(0, 0, eventCanvas.width, eventCanvas.height);
        markLightboxFillLayerDirty();
        pushLightboxEditUndo(() => {
          lightboxEditBase = previousEdit.base;
          lightboxPaintActions = previousEdit.actions; lightboxFillActions = previousEdit.fills;
          lightboxPlacedImage = previousEdit.placed; lightboxPlacedSelected = previousEdit.selected;
          lightboxBaseFlipX = previousEdit.flipX; lightboxBaseFlipY = previousEdit.flipY;
          markLightboxFillLayerDirty();
        });
        dialog.close(); toast("已应用材质颜色修改，可继续编辑或撤销；完成后确认生成节点");
      } catch (error) {
        toast(`材质颜色修改失败：${error.message}`);
        for (const control of dialog.querySelectorAll("button,input,select")) control.disabled = false;
      } finally { busy = false; if (!closed) schedule(); }
    };
    document.getElementById("lightboxLeftTools").append(dialog);
    sizeObserver.observe(eventCanvas);
    closeObserver.observe(els.lightbox, { attributes: true, attributeFilter: ["class"] });
    syncLightboxPaletteTop(); draw();
  }
  document.getElementById("lightboxRegionHue").addEventListener("click", () => openRegionHue().catch(error => toast(`无法打开材质颜色修改：${error.message}`)));
  document.getElementById("lightboxColorBrush").onclick = () => openRegionHue("paint").catch(error => toast(`无法打开自由上色：${error.message}`));
})();
